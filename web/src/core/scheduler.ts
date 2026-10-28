/**
 * scheduler.ts — 每日学习队列编排
 *
 * 规则：
 *  1. 今日新词：从未学词中按"顺序 / 随机"取 min(每日新词数 - 今日已学新词, 剩余)。
 *  2. 巩固：已见过但仍未达三连对的词（学习中），当天继续练。
 *  3. 复习：已掌握且到期的词，按**逾期紧迫度**降序取，受每日复习上限约束。
 *  4. 打散：三类词按比例交错插入队列，避免"先一口气刷 20 个新词"造成的认知过载，
 *     同时避免同一个词相邻重复出现。
 */

import type { SessionItem, Settings, Word, WordProgress, QuizMode } from './types';
import { DEFAULT_SETTINGS } from './types';
import { makeRng, shuffle } from './rng';
import { chooseMode } from './quiz';
import { dateKey, dayStart, isLeech, overdueScore } from './srs';

export interface BuildPlanInput {
  /** 已选等级的全部词（按 level、order 排好） */
  words: Word[];
  progress: Map<string, WordProgress>;
  settings: Settings;
  now: number;
  seed?: number;
}

export interface Plan {
  date: string;
  newIds: string[];
  learningIds: string[];
  reviewIds: string[];
  /** 交错后的最终队列 */
  queue: SessionItem[];
  /** 今日已完成的新学词数 */
  newDoneToday: number;
  /** 剩余待复习（超出上限的部分） */
  reviewBacklog: number;
}

export function buildPlan(input: BuildPlanInput): Plan {
  const { words, progress, settings = DEFAULT_SETTINGS, now } = input;
  const rng = makeRng(input.seed ?? (now >>> 0));
  const today = dateKey(now);
  const start = dayStart(now);

  const get = (w: Word): WordProgress | undefined => progress.get(w.id);

  let newDoneToday = 0;
  for (const w of words) {
    const p = get(w);
    if (p && p.firstSeen && p.firstSeen >= start) newDoneToday++;
  }

  // 1) 新词
  const newPool = words.filter((w) => {
    const p = get(w);
    return !p || p.state === 'new';
  });
  const quota = Math.max(0, settings.newPerDay - newDoneToday);
  let newPicks: Word[];
  if (settings.orderStrategy === 'random') {
    newPicks = shuffle(newPool, rng).slice(0, quota);
  } else {
    // 顺序模式下也做"窗口内随机"：在候选前 3 倍窗口内随机，兼顾进度可见与不枯燥
    const win = newPool.slice(0, Math.max(quota, quota * 3));
    newPicks = shuffle(win, rng).slice(0, quota);
  }

  // 2) 巩固（学习中）
  const learningPool = words.filter((w) => {
    const p = get(w);
    return p && p.state === 'learning' && p.due <= now;
  });
  const learningPicks = shuffle(learningPool, rng).slice(0, Math.max(10, settings.newPerDay * 2));

  // 3) 复习（已掌握且到期）
  const dueReview = words
    .filter((w) => {
      const p = get(w);
      return p && p.state === 'mastered' && p.due <= now;
    })
    .sort((a, b) => overdueScore(get(b)!, now) - overdueScore(get(a)!, now));
  const reviewPicks = dueReview.slice(0, settings.maxReviewPerDay);
  const reviewBacklog = Math.max(0, dueReview.length - reviewPicks.length);

  // 4) 为每个词分配题型（模态轮换：尽量不重复）
  const usedCount = new Map<string, Partial<Record<QuizMode, number>>>();
  const pickMode = (w: Word): QuizMode => {
    const key = w.id;
    const uc = usedCount.get(key) ?? {};
    const state = get(w)?.state ?? 'new';
    const m = chooseMode(w, settings.modes, uc, rng, state) ?? 'jp2zh';
    uc[m] = (uc[m] ?? 0) + 1;
    usedCount.set(key, uc);
    return m;
  };

  const toItems = (ws: Word[], source: SessionItem['source']): SessionItem[] =>
    ws.map((w) => ({ wordId: w.id, mode: pickMode(w), source }));

  const lists: SessionItem[][] = [
    toItems(shuffle(reviewPicks, rng), 'review'),
    toItems(shuffle(learningPicks, rng), 'learning'),
    toItems(shuffle(newPicks, rng), 'new'),
  ];

  return {
    date: today,
    newIds: newPicks.map((w) => w.id),
    learningIds: learningPicks.map((w) => w.id),
    reviewIds: reviewPicks.map((w) => w.id),
    queue: interleave(lists),
    newDoneToday,
    reviewBacklog,
  };
}

/**
 * 易错词专项：只取当前最顽固的词，按失败严重度排序。
 * 与日常队列分开，避免这些词在大量新词里被稀释。
 */
export function buildDrillPlan(
  words: Word[],
  progress: Map<string, WordProgress>,
  settings: Settings,
  now: number,
  limit = 20,
): Plan {
  const picked = words
    .filter((w) => isLeech(progress.get(w.id)))
    .sort((a, b) => {
      const pa = progress.get(a.id)!;
      const pb = progress.get(b.id)!;
      return pb.failStreak * 2 + pb.lapses - (pa.failStreak * 2 + pa.lapses);
    })
    .slice(0, limit);
  const rng = makeRng(now >>> 0);
  const usedCount = new Map<string, Partial<Record<QuizMode, number>>>();
  const queue: SessionItem[] = picked.map((w) => {
    const uc = usedCount.get(w.id) ?? {};
    const mode = chooseMode(w, settings.modes, uc, rng, 'learning') ?? 'jp2zh';
    uc[mode] = (uc[mode] ?? 0) + 1;
    usedCount.set(w.id, uc);
    return { wordId: w.id, mode, source: 'learning' };
  });
  return {
    date: dateKey(now),
    newIds: [],
    learningIds: picked.map((w) => w.id),
    reviewIds: [],
    queue,
    newDoneToday: 0,
    reviewBacklog: 0,
  };
}

/**
 * 按比例交错合并多个队列：每轮从"剩余比例最高"的队列取一个，
 * 保证同类词不会连续扎堆出现。
 */
export function interleave(lists: SessionItem[][]): SessionItem[] {
  const queues = lists.map((l) => l.slice());
  const totals = queues.map((q) => q.length);
  const grand = totals.reduce((a, b) => a + b, 0);
  const out: SessionItem[] = [];
  let lastId = '';
  let guard = 0;
  while (out.length < grand && guard++ < grand * 4 + 16) {
    let best = -1;
    let bestRatio = -Infinity;
    for (let i = 0; i < queues.length; i++) {
      if (!queues[i].length) continue;
      const ratio = (queues[i].length / Math.max(1, totals[i])) * 1.0 - out.length * 0.0001;
      if (ratio > bestRatio && queues[i][0].wordId !== lastId) {
        bestRatio = ratio;
        best = i;
      }
    }
    if (best < 0) {
      // 只有与上一个相同的候选，强制取一个
      for (let i = 0; i < queues.length; i++) {
        if (queues[i].length) {
          best = i;
          break;
        }
      }
    }
    if (best < 0) break;
    const item = queues[best].shift()!;
    out.push(item);
    lastId = item.wordId;
  }
  return out;
}

/** 估算完成整轮所需分钟数 */
export function estimateMinutes(queue: SessionItem[]): number {
  const sec = queue.reduce((s, it) => s + (it.mode === 'typing' ? 16 : it.mode === 'selfRate' ? 6 : 9), 0);
  return Math.max(1, Math.round(sec / 60));
}

/**
 * 把当前项后移至少 gap 项，用于「预习后先看几个词，再回来测验」。
 * 队列长度不变，只改变出现顺序。
 */
export function deferItem<T extends { wordId: string }>(list: T[], from: number, gap = 4): T[] {
  if (from < 0 || from >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  let at = Math.min(copy.length, from + Math.max(1, gap));
  while (at < copy.length && copy[at]?.wordId === item.wordId) at++;
  copy.splice(at, 0, item);
  return copy;
}
