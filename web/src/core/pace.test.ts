import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Level, type Settings, type Word, type WordProgress } from './types';
import { computePace, parseDateKey } from './pace';
import { reviewLoad } from './stats';
import { DAY, dayStart, newProgress } from './srs';

function mkWords(n: number): Word[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `n5-${String(i).padStart(4, '0')}`,
    level: 'N5' as Level,
    word: `語${i}`,
    reading: `ご${i}`,
    romaji: `go${i}`,
    pos: ['名词'],
    bucket: 'N' as const,
    zh: [`词${i}`],
    en: ['x'],
    example: null,
    cf: [],
    order: i,
  }));
}

const NOW = new Date(2026, 9, 27, 10, 0, 0).getTime(); // 2026-10-27 10:00 本地时间

function settings(patch: Partial<Settings> = {}): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function masteredAt(words: Word[], count: number, due: number): Map<string, WordProgress> {
  const m = new Map<string, WordProgress>();
  for (let i = 0; i < count; i++) {
    const p = newProgress(words[i].id, 'N5');
    p.state = 'mastered';
    p.due = due;
    m.set(p.id, p);
  }
  return m;
}

describe('考试配速', () => {
  it('日期按本地时区解析，非法日期返回 null', () => {
    const ts = parseDateKey('2026-11-06');
    expect(ts).not.toBeNull();
    const d = new Date(ts as number);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 6]);
    expect(parseDateKey('2026-02-30')).toBeNull();
    expect(parseDateKey('2026/11/06')).toBeNull();
  });

  it('未设置考试日期时返回 null', () => {
    const words = mkWords(10);
    expect(computePace(words, new Map(), settings(), NOW)).toBeNull();
  });

  it('按剩余词量与可学天数给出建议，并判断当前节奏是否来得及', () => {
    const words = mkWords(100);
    const p = computePace(words, new Map(), settings({ examDate: '2026-11-06', newPerDay: 10 }), NOW)!;
    expect(p.daysLeft).toBe(10);
    expect(p.studyDays).toBe(9);
    expect(p.remaining).toBe(100);
    expect(p.recommendedNewPerDay).toBe(12); // ceil(100 / 9)
    expect(p.daysAtCurrentPace).toBe(10);
    expect(p.onTrack).toBe(false);

    const fast = computePace(words, new Map(), settings({ examDate: '2026-11-06', newPerDay: 12 }), NOW)!;
    expect(fast.onTrack).toBe(true);
  });

  it('已掌握与已会跳过的词不计入剩余量', () => {
    const words = mkWords(50);
    const progress = masteredAt(words, 20, NOW + DAY);
    const ignored = newProgress(words[20].id, 'N5');
    ignored.state = 'ignored';
    progress.set(ignored.id, ignored);
    const p = computePace(words, progress, settings({ examDate: '2026-11-11', newPerDay: 5 }), NOW)!;
    expect(p.mastered).toBe(20);
    expect(p.ignored).toBe(1);
    expect(p.remaining).toBe(29);
  });

  it('考试当天或已过期时，剩余词量永远算不上「来得及」', () => {
    const words = mkWords(10);
    const today = computePace(words, new Map(), settings({ examDate: '2026-10-27' }), NOW)!;
    expect(today.daysLeft).toBe(0);
    expect(today.onTrack).toBe(false);
    const past = computePace(words, new Map(), settings({ examDate: '2026-10-20' }), NOW)!;
    expect(past.daysLeft).toBe(-7);
    expect(past.onTrack).toBe(false);
  });
});

describe('未来复习负载', () => {
  it('逾期词归入今天，未来到期词按天数分桶，学习中词不计入', () => {
    const words = mkWords(10);
    const progress = new Map<string, WordProgress>();
    const start = dayStart(NOW);
    const due = (id: string, t: number, state: WordProgress['state'] = 'mastered') => {
      const p = newProgress(id, 'N5');
      p.state = state;
      p.due = t;
      progress.set(id, p);
    };
    due(words[0].id, NOW - 3 * DAY); // 逾期
    due(words[1].id, NOW + 2 * DAY + 3600_000);
    due(words[2].id, start + 2 * DAY);
    due(words[3].id, NOW + 20 * DAY); // 超出窗口
    due(words[4].id, NOW, 'learning'); // 学习中不占复习负载

    const load = reviewLoad([...progress.values()], NOW, 7);
    expect(load).toHaveLength(7);
    expect(load[0].count).toBe(1);
    expect(load[2].count).toBe(2);
    expect(load[1].count).toBe(0);
    expect(load.reduce((s, d) => s + d.count, 0)).toBe(3);
    expect(load[0].label).toBe('今天');
  });
});
