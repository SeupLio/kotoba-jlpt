import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Settings, type WordProgress } from './types';
import {
  DAY,
  DEMOTE_FAIL_STREAK,
  applyAnswer,
  intervalForStage,
  isLeech,
  needsNextDayCheck,
  newProgress,
  nextVerificationAt,
  retentionAt,
} from './srs';

const S: Settings = { ...DEFAULT_SETTINGS, crossSessionMastery: false };
const SX: Settings = { ...DEFAULT_SETTINGS, crossSessionMastery: true };

function p0(over: Partial<WordProgress> = {}): WordProgress {
  return { ...newProgress('n5-0001', 'N5', S), ...over };
}

describe('掌握判定：连续三次正确', () => {
  it('连续 3 次正确后标记为熟练，并进入复习阶段 0', () => {
    let p = p0();
    const t = Date.now();
    p = applyAnswer(p, true, 'jp2zh', t, S).next;
    expect(p.state).toBe('learning');
    p = applyAnswer(p, true, 'zh2jp', t, S).next;
    expect(p.state).toBe('learning');
    const r = applyAnswer(p, true, 'jp2zh', t, S);
    expect(r.justMastered).toBe(true);
    expect(r.next.state).toBe('mastered');
    expect(r.next.stage).toBe(0);
    expect(r.next.interval).toBe(intervalForStage(0, r.next.ease, S));
    expect(r.next.due).toBeGreaterThan(t);
  });

  it('中途答错会把连续正确次数清零', () => {
    let p = p0();
    const t = Date.now();
    p = applyAnswer(p, true, 'jp2zh', t, S).next;
    p = applyAnswer(p, true, 'jp2zh', t, S).next;
    expect(p.streak).toBe(2);
    p = applyAnswer(p, false, 'jp2zh', t, S).next;
    expect(p.streak).toBe(0);
    expect(p.lapses).toBe(1);
    p = applyAnswer(p, true, 'jp2zh', t, S).next;
    expect(p.streak).toBe(1);
    expect(p.state).toBe('learning');
  });

  it('开启跨天要求后，同一天的三次正确不算掌握，并安排次日验证', () => {
    let p = p0();
    const t = new Date(2026, 9, 27, 10, 0, 0).getTime();
    for (let i = 0; i < 3; i++) p = applyAnswer(p, true, 'jp2zh', t + i * 1000, SX).next;
    expect(p.streak).toBe(3);
    expect(p.state).toBe('learning');
    expect(needsNextDayCheck(p, SX)).toBe(true);
    // 已经刷满，不该当天无限重问：到期点至少是次日清晨 / 6 小时后
    expect(p.due).toBeGreaterThanOrEqual(t + 6 * 3600_000);
    expect(p.due).toBeGreaterThan(nextVerificationAt(t) - 1);
    // 跨到第二天再答对一次 → 掌握
    const r = applyAnswer(p, true, 'jp2zh', p.due + 1000, SX);
    expect(r.next.state).toBe('mastered');
    expect(r.justMastered).toBe(true);
  });

  it('答错会清空本轮跨天记录，降级后当天三连对不能重新熟练', () => {
    const t = new Date(2026, 9, 27, 10, 0, 0).getTime();
    let p = p0({
      state: 'mastered',
      stage: 2,
      interval: 4,
      due: t,
      lastReview: t - 4 * DAY,
      correctDays: ['2026-10-20', '2026-10-24'],
    });
    for (let i = 0; i < DEMOTE_FAIL_STREAK; i++) {
      p = applyAnswer(p, false, 'jp2zh', t + i * 60_000, SX).next;
    }
    expect(p.state).toBe('learning');
    expect(p.correctDays).toEqual([]);

    // 同一天连对 3 次：只能算「本轮达标，等待跨天验证」
    for (let i = 0; i < 3; i++) p = applyAnswer(p, true, 'jp2zh', t + 30 * 60_000 + i * 1000, SX).next;
    expect(p.streak).toBe(3);
    expect(p.state).toBe('learning');
    expect(p.correctDays).toHaveLength(1);

    const r = applyAnswer(p, true, 'jp2zh', p.due + 1000, SX);
    expect(r.next.state).toBe('mastered');
  });
});

describe('艾宾浩斯复习调度', () => {
  it('按时答对：阶段 +1、间隔变长、到期时间顺延', () => {
    let p = p0({ state: 'mastered', stage: 0, ease: 2.5, interval: 1, due: Date.now(), lastReview: Date.now() });
    const now = Date.now();
    const r = applyAnswer(p, true, 'jp2zh', now, S);
    expect(r.next.stage).toBe(1);
    expect(r.next.interval).toBeGreaterThanOrEqual(p.interval);
    expect(r.next.due).toBeGreaterThan(now);
  });

  it('严重逾期（>3 倍间隔）才答对：不升阶', () => {
    const now = Date.now();
    const p = p0({
      state: 'mastered',
      stage: 3,
      ease: 2.5,
      interval: 7,
      due: now - 30 * DAY,
      lastReview: now - 37 * DAY,
    });
    const r = applyAnswer(p, true, 'jp2zh', now, S);
    expect(r.next.stage).toBe(2); // 逾期超过 3 倍 → 降一阶
  });

  it('中等逾期（1.5~3 倍）答对：维持阶段', () => {
    const now = Date.now();
    const interval = 10;
    const p = p0({
      state: 'mastered',
      stage: 3,
      ease: 2.5,
      interval,
      due: now - 2 * interval * DAY,
      lastReview: now - 3 * interval * DAY,
    });
    const r = applyAnswer(p, true, 'jp2zh', now, S);
    expect(r.next.stage).toBe(3);
  });

  it('答错：阶段回退两级并安排在当天重练', () => {
    const now = Date.now();
    const p = p0({ state: 'mastered', stage: 4, ease: 2.5, interval: 15, due: now, lastReview: now });
    const r = applyAnswer(p, false, 'jp2zh', now, S);
    expect(r.next.stage).toBe(2);
    expect(r.next.due - now).toBeLessThan(DAY);
  });

  it('难度因子随作答自适应：答对放宽、答错收紧，并受上下限约束', () => {
    let p = p0({ ease: 2.5 });
    for (let i = 0; i < 20; i++) p = applyAnswer(p, true, 'jp2zh', Date.now(), S).next;
    expect(p.ease).toBeLessThanOrEqual(S.easeMax);
    expect(p.ease).toBeGreaterThan(2.5);
    for (let i = 0; i < 30; i++) p = applyAnswer(p, false, 'jp2zh', Date.now(), S).next;
    expect(p.ease).toBeGreaterThanOrEqual(S.easeMin);
  });

  it('间隔随阶段单调递增', () => {
    const vals = [0, 1, 2, 3, 4, 5].map((s) => intervalForStage(s, 2.5, S));
    for (let i = 1; i < vals.length; i++) expect(vals[i]).toBeGreaterThan(vals[i - 1]);
  });

  it('提前复习不升阶、不改原定复习日期', () => {
    const now = Date.now();
    const p = p0({ state: 'mastered', stage: 2, ease: 2.5, interval: 10, due: now + 5 * DAY, lastReview: now - 5 * DAY });
    const r = applyAnswer(p, true, 'jp2zh', now, S);
    expect(r.next.stage).toBe(2);
    expect(r.next.due).toBe(p.due);
  });

  it('只有连续失败才退级：中间答对一次会清零失败计数', () => {
    const t = Date.now();
    let p = p0({ state: 'mastered', stage: 3, ease: 2.5, interval: 7, due: t, lastReview: t - 7 * DAY });
    p = applyAnswer(p, false, 'jp2zh', t, S).next;
    p = applyAnswer(p, false, 'jp2zh', t + 60_000, S).next;
    expect(p.state).toBe('mastered');
    expect(p.failStreak).toBe(2);
    p = applyAnswer(p, true, 'jp2zh', t + 120_000, S).next;
    expect(p.failStreak).toBe(0);
    p = applyAnswer(p, false, 'jp2zh', t + 180_000, S).next;
    p = applyAnswer(p, false, 'jp2zh', t + 240_000, S).next;
    expect(p.state).toBe('mastered');
    expect(p.failStreak).toBe(2);
  });
});

describe('复习债：不做自动核销', () => {
  it('长期未复习的已掌握词不会被系统自动改写状态或跳过', () => {
    const now = Date.now();
    const stale = p0({
      state: 'mastered',
      stage: 2,
      ease: 2.5,
      interval: 4,
      due: now - 300 * DAY,
      lastReview: now - 304 * DAY,
    });
    // 时间流逝本身不会触发任何状态变更；只有真实作答才会推进
    expect(stale.state).toBe('mastered');
    expect(stale.due).toBeLessThan(now);

    const r = applyAnswer(stale, true, 'jp2zh', now, S);
    expect(r.next.state).toBe('mastered');
    expect(r.next.due).toBeGreaterThan(now);
    expect(r.next.stage).toBeLessThanOrEqual(stale.stage);
  });
});

describe('易错词判定', () => {
  it('连续答错 2 次或累计遗忘 4 次且未掌握时标记为易错词', () => {
    expect(isLeech(p0({ state: 'new' }))).toBe(false);
    expect(isLeech(p0({ state: 'ignored' }))).toBe(false);
    expect(isLeech(p0({ state: 'learning', failStreak: 2 }))).toBe(true);
    expect(isLeech(p0({ state: 'mastered', failStreak: 2 }))).toBe(true);
    expect(isLeech(p0({ state: 'learning', failStreak: 0, lapses: 4 }))).toBe(true);
    expect(isLeech(p0({ state: 'mastered', failStreak: 0, lapses: 9 }))).toBe(false);
  });
});

describe('记忆留存预测', () => {
  it('刚复习完接近 1，到间隔点时约 0.9，超过间隔后继续衰减', () => {
    const now = Date.now();
    const p = p0({ state: 'mastered', interval: 10, lastReview: now });
    expect(retentionAt(p, now)).toBeCloseTo(1, 1);
    expect(retentionAt(p, now + 10 * DAY)).toBeCloseTo(0.9, 2);
    expect(retentionAt(p, now + 40 * DAY)).toBeLessThan(0.7);
  });
});
