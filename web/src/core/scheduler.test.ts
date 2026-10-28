import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Level, type Settings, type Word, type WordProgress } from './types';
import { buildDrillPlan, buildPlan, deferItem, estimateMinutes, interleave } from './scheduler';
import { DAY, applyAnswer, dayStart, newProgress } from './srs';
import type { SessionItem } from './types';

function mk(id: string, order: number, level: Level = 'N5'): Word {
  return {
    id,
    level,
    word: `w${order}`,
    reading: `r${order}`,
    romaji: `r${order}`,
    pos: ['名词'],
    bucket: 'N',
    zh: [`义${order}`],
    en: [],
    example: null,
    cf: [],
    order,
  };
}

const words: Word[] = Array.from({ length: 60 }, (_, i) => mk(`n5-${i}`, i));

function build(over: Partial<Settings> = {}, progress: Map<string, WordProgress> = new Map(), now = Date.now()) {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...over };
  return buildPlan({ words, progress, settings, now, seed: 20240101 });
}

describe('每日计划', () => {
  it('新词数量不超过每日上限', () => {
    const plan = build({ newPerDay: 10 });
    expect(plan.newIds).toHaveLength(10);
    expect(plan.queue.length).toBe(10);
  });

  it('当天已学过的新词会抵扣额度', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    const todayNoon = dayStart(now) + 12 * 3600_000; // 固定在今天白天，避免跨零点误判
    for (let i = 0; i < 6; i++) {
      const w = words[i];
      progress.set(w.id, { ...newProgress(w.id, w.level), firstSeen: todayNoon, state: 'learning' });
    }
    const plan = build({ newPerDay: 10 }, progress, now);
    expect(plan.newDoneToday).toBe(6);
    expect(plan.newIds).toHaveLength(4);
  });

  it('只看复习时新词为 0', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    const w = words[0];
    let p = newProgress(w.id, w.level);
    for (let i = 0; i < 3; i++) p = applyAnswer(p, true, 'jp2zh', now - (3 - i) * DAY, DEFAULT_SETTINGS).next;
    progress.set(w.id, p);
    const plan = build({ newPerDay: 0 }, progress, now);
    expect(plan.newIds).toHaveLength(0);
    expect(plan.reviewIds).toContain(w.id);
  });

  it('到期复习按逾期紧迫度排序，且受上限约束', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    words.slice(0, 12).forEach((w, i) => {
      const p: WordProgress = {
        ...newProgress(w.id, w.level),
        state: 'mastered',
        stage: 1,
        interval: 2,
        due: now - (i + 1) * DAY, // i 越大越逾期
        lastReview: now - 3 * DAY,
      };
      progress.set(w.id, p);
    });
    const plan = build({ maxReviewPerDay: 5 }, progress, now);
    expect(plan.reviewIds).toHaveLength(5);
    expect(plan.reviewBacklog).toBe(7);
    // 最逾期的词排在最前
    expect(plan.reviewIds[0]).toBe(words[11].id);
  });

  it('逾期很久的已掌握词仍会进入复习队列，不会被自动核销', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    words.slice(0, 3).forEach((w) => {
      progress.set(w.id, {
        ...newProgress(w.id, w.level),
        state: 'mastered',
        stage: 0,
        interval: 1,
        due: now - 400 * DAY,
        lastReview: now - 401 * DAY,
      });
    });
    const plan = build({ newPerDay: 0, maxReviewPerDay: 20 }, progress, now);
    expect(plan.reviewIds).toHaveLength(3);
    expect(plan.reviewBacklog).toBe(0);
  });

  it('队列中同一个词不会连续相邻出现', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    words.slice(0, 20).forEach((w) => {
      progress.set(w.id, { ...newProgress(w.id, w.level), state: 'learning', due: now - 1000 });
    });
    const plan = build({ newPerDay: 8 }, progress, now);
    for (let i = 1; i < plan.queue.length; i++) {
      expect(plan.queue[i].wordId).not.toBe(plan.queue[i - 1].wordId);
    }
  });

  it('题型在启用列表内，并优先匹配学习阶段', () => {
    const plan = build({ newPerDay: 6, modes: ['jp2zh', 'zh2jp', 'typing'] });
    const modes = new Set(plan.queue.map((q) => q.mode));
    expect([...modes].every((m) => ['jp2zh', 'zh2jp', 'typing'].includes(m))).toBe(true);
    // 新词阶段不直接上拼写，先建立形义识别
    expect(modes.has('typing')).toBe(false);
  });

  it('已掌握的词优先产出型题型', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    words.slice(0, 8).forEach((w) => {
      progress.set(w.id, {
        ...newProgress(w.id, w.level),
        state: 'mastered',
        stage: 1,
        interval: 2,
        due: now - DAY,
        lastReview: now - 3 * DAY,
      });
    });
    const plan = build({ newPerDay: 0, modes: ['jp2zh', 'typing', 'zh2jp'] }, progress, now);
    const modes = new Set(plan.queue.map((q) => q.mode));
    expect([...modes].every((m) => m === 'typing' || m === 'zh2jp')).toBe(true);
  });

  it('随机模式下新词也来自未学池且不超上限', () => {
    const plan = build({ newPerDay: 5, orderStrategy: 'random' });
    expect(plan.newIds.length).toBeLessThanOrEqual(5);
    const set = new Set(plan.newIds);
    expect(set.size).toBe(plan.newIds.length);
  });
});

describe('易错词专项', () => {
  it('只取易错词，并按失败严重度排序', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    progress.set(words[0].id, {
      ...newProgress(words[0].id, words[0].level),
      state: 'learning',
      failStreak: 2,
      lapses: 2,
    });
    progress.set(words[1].id, {
      ...newProgress(words[1].id, words[1].level),
      state: 'learning',
      failStreak: 3,
      lapses: 6,
    });
    progress.set(words[2].id, { ...newProgress(words[2].id, words[2].level), state: 'learning' });
    progress.set(words[3].id, { ...newProgress(words[3].id, words[3].level), state: 'new' });

    const plan = buildDrillPlan(words, progress, DEFAULT_SETTINGS, now);
    expect(plan.queue.map((q) => q.wordId)).toEqual([words[1].id, words[0].id]);
    expect(plan.queue.every((q) => q.source === 'learning')).toBe(true);
    expect(plan.newIds).toHaveLength(0);
    expect(plan.reviewIds).toHaveLength(0);
  });

  it('专项队列受数量上限约束', () => {
    const now = Date.now();
    const progress = new Map<string, WordProgress>();
    words.slice(0, 10).forEach((w) => {
      progress.set(w.id, {
        ...newProgress(w.id, w.level),
        state: 'learning',
        failStreak: 2,
      });
    });
    const plan = buildDrillPlan(words, progress, DEFAULT_SETTINGS, now, 4);
    expect(plan.queue).toHaveLength(4);
  });
});

describe('交错算法', () => {
  it('按比例混合且不丢项', () => {
    const a: SessionItem[] = Array.from({ length: 6 }, (_, i) => ({ wordId: `a${i}`, mode: 'jp2zh', source: 'review' }));
    const b: SessionItem[] = Array.from({ length: 3 }, (_, i) => ({ wordId: `b${i}`, mode: 'jp2zh', source: 'new' }));
    const out = interleave([a, b]);
    expect(out).toHaveLength(9);
    expect(new Set(out.map((o) => o.wordId)).size).toBe(9);
  });

  it('大类不会长时间连续扎堆', () => {
    const a: SessionItem[] = Array.from({ length: 10 }, (_, i) => ({ wordId: `a${i}`, mode: 'jp2zh', source: 'review' }));
    const b: SessionItem[] = Array.from({ length: 10 }, (_, i) => ({ wordId: `b${i}`, mode: 'jp2zh', source: 'new' }));
    const out = interleave([a, b]);
    let maxRun = 0;
    let run = 0;
    let prev = '';
    for (const o of out) {
      run = o.wordId.startsWith(prev.slice(0, 1)) && prev ? run + 1 : 1;
      maxRun = Math.max(maxRun, run);
      prev = o.wordId;
    }
    expect(maxRun).toBeLessThanOrEqual(2);
  });
});

describe('时长估算', () => {
  it('拼写题耗时高于选择题', () => {
    const choice: SessionItem[] = Array.from({ length: 10 }, () => ({ wordId: 'x', mode: 'jp2zh', source: 'new' }));
    const typing: SessionItem[] = Array.from({ length: 10 }, () => ({ wordId: 'x', mode: 'typing', source: 'new' }));
    expect(estimateMinutes(typing)).toBeGreaterThanOrEqual(estimateMinutes(choice));
  });
});

describe('预习后移', () => {
  const list: SessionItem[] = Array.from({ length: 8 }, (_, i) => ({
    wordId: `w${i}`,
    mode: 'jp2zh',
    source: 'new',
  }));

  it('保持队列长度与词条不丢失', () => {
    const out = deferItem(list, 0, 4);
    expect(out).toHaveLength(list.length);
    expect(new Set(out.map((x) => x.wordId)).size).toBe(list.length);
  });

  it('同词至少在 4 项之后才再次出现', () => {
    const out = deferItem(list, 0, 4);
    expect(out[0].wordId).toBe('w1');
    const at = out.findIndex((x) => x.wordId === 'w0');
    expect(at).toBeGreaterThanOrEqual(4);
  });

  it('队尾项后移时留在队列末尾且不丢失', () => {
    const out = deferItem(list, list.length - 1, 4);
    expect(out).toHaveLength(list.length);
    expect(out[out.length - 1].wordId).toBe('w7');
  });
});
