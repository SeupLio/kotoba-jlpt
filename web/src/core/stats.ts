/**
 * stats.ts — 学习统计与预测
 */

import type { AnswerLog, Level, Word, WordProgress } from './types';
import { DAY, clamp, dateKey, dayStart, retentionAt } from './srs';

export interface LevelStat {
  level: Level;
  total: number;
  newCount: number;
  learning: number;
  mastered: number;
  ignored: number;
  /** 平均掌握度 0~1 */
  avgMastery: number;
}

export function levelStats(
  words: Word[],
  progress: Map<string, WordProgress>,
  now: number,
  mastery: (p: WordProgress, now: number) => number,
): LevelStat[] {
  const groups = new Map<Level, Word[]>();
  for (const w of words) {
    const arr = groups.get(w.level) ?? [];
    arr.push(w);
    groups.set(w.level, arr);
  }
  const out: LevelStat[] = [];
  for (const [level, list] of groups) {
    let newCount = 0;
    let learning = 0;
    let mastered = 0;
    let ignored = 0;
    let sum = 0;
    for (const w of list) {
      const p = progress.get(w.id);
      if (!p || p.state === 'new') {
        newCount++;
        continue;
      }
      if (p.state === 'ignored') ignored++;
      else if (p.state === 'mastered') mastered++;
      else learning++;
      sum += mastery(p, now);
    }
    out.push({
      level,
      total: list.length,
      newCount,
      learning,
      mastered,
      ignored,
      avgMastery: list.length ? sum / list.length : 0,
    });
  }
  return out.sort((a, b) => a.level.localeCompare(b.level));
}

export function accuracyOf(logs: AnswerLog[]): number {
  if (!logs.length) return 0;
  return logs.filter((l) => l.ok).length / logs.length;
}

/** 未来若干天后的平均预测留存率（用于"记忆曲线"） */
export function forecastRetention(progress: WordProgress[], now: number, days: number[]): number[] {
  if (!progress.length) return days.map(() => 0);
  return days.map((d) => {
    const t = now + d * DAY;
    const sum = progress.reduce((s, p) => s + retentionAt(p, t), 0);
    return clamp(sum / progress.length, 0, 1);
  });
}

/** 生成最近 n 天的日期键（含今天，倒序：最早 → 今天） */
export function recentDays(now: number, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dateKey(now - i * DAY));
  return out;
}

export interface LoadDay {
  key: string;
  label: string;
  /** 当天到期的已掌握词数（第 0 天包含所有逾期词） */
  count: number;
}

/** 未来若干天的复习负载：帮助用户提前发现「某天要复习 200 个」的堆积 */
export function reviewLoad(progress: WordProgress[], now: number, days = 7): LoadDay[] {
  const start = dayStart(now);
  const counts = new Array<number>(days).fill(0);
  for (const p of progress) {
    if (p.state !== 'mastered' || !p.due) continue;
    if (p.due <= now) {
      counts[0]++;
      continue;
    }
    const idx = Math.floor((p.due - start) / DAY);
    if (idx >= 0 && idx < days) counts[idx]++;
  }
  return counts.map((count, i) => {
    const d = new Date(start + i * DAY);
    return {
      key: dateKey(start + i * DAY),
      label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}`,
      count,
    };
  });
}

/** 记忆强度分布（把 0~1 的留存率分到 5 档） */
export function retentionBuckets(progress: WordProgress[], now: number): number[] {
  const b = [0, 0, 0, 0, 0];
  for (const p of progress) {
    if (p.state === 'new' || p.state === 'ignored') continue;
    const r = retentionAt(p, now);
    const i = clamp(Math.floor(r * 5), 0, 4);
    b[i]++;
  }
  return b;
}
