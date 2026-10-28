/**
 * srs.ts — 记忆调度核心
 *
 * 设计要点（相对传统 SM-2 / 商业背单词应用的改进）：
 *  1. 掌握判定 = **连续 N 次正确**（默认 3），且要求分布在不同学习日（可关闭），
 *     避免"同一场次靠瞬时记忆刷出三连对"的假熟练。
 *  2. 掌握后进入艾宾浩斯复习阶段：间隔按 [1,2,4,7,15,30,60,120,240] 天递增，
 *     并用**难度因子 ease** 对间隔做个性化缩放（答对放宽、答错收紧）。
 *  3. **逾期惩罚**：严重逾期后才答对的词不升阶（记忆已衰减），避免"拖够久再答对就跳级"。
 *  4. 记忆强度可量化：R(t) = 0.9^(t / interval)，用于统计页展示预测留存率。
 */

import type { Level, QuizMode, Settings, WordProgress, WordState } from './types';
import { DEFAULT_SETTINGS } from './types';

export const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;
/** 连续答错达到该次数：已掌握的词退回学习中 */
export const DEMOTE_FAIL_STREAK = 3;
/** 易错词（需要重点攻克）的判定阈值 */
export const LEECH_FAIL_STREAK = 2;
export const LEECH_LAPSES = 4;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 本地日期键 YYYY-MM-DD */
export function dateKey(ts: number): string {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function isSameDay(a: number, b: number): boolean {
  return dateKey(a) === dateKey(b);
}

/**
 * 跨天验证的时间点：次日 04:00，且至少间隔 6 小时。
 * 只要求「次日任意时刻」会留下 23:59 → 00:01 十分钟刷完的漏洞；
 * 固定一个清晨时间点，既保证真的跨过一次睡眠，也不至于让用户第二天干等。
 */
export function nextVerificationAt(now: number): number {
  const nextDayEarly = dayStart(now + DAY) + 4 * 60 * MINUTE;
  return Math.max(nextDayEarly, now + 6 * 60 * MINUTE);
}

/** 是否已满足「连续正确达到要求」，只差跨天的最后一次验证 */
export function needsNextDayCheck(p: WordProgress, s: Settings = DEFAULT_SETTINGS): boolean {
  return (
    !!s.crossSessionMastery &&
    p.state === 'learning' &&
    p.streak >= s.masteryStreak &&
    p.correctDays.length < 2
  );
}

/** 易错词：最近连续答错 2 次，或累计多次遗忘且仍未掌握 */
export function isLeech(p: WordProgress | undefined): boolean {
  if (!p || p.state === 'new' || p.state === 'ignored') return false;
  if ((p.failStreak ?? 0) >= LEECH_FAIL_STREAK) return true;
  return p.lapses >= LEECH_LAPSES && p.state === 'learning';
}

/** 某阶段对应的复习间隔（天） */
export function intervalForStage(stage: number, ease: number, s: Settings = DEFAULT_SETTINGS): number {
  const list = s.intervalDays.length ? s.intervalDays : DEFAULT_SETTINGS.intervalDays;
  const base = list[clamp(stage, 0, list.length - 1)];
  return Math.max(1, Math.round(base * (ease / DEFAULT_SETTINGS.easeInit)));
}

export function newProgress(id: string, level: Level, s: Settings = DEFAULT_SETTINGS): WordProgress {
  return {
    id,
    level,
    state: 'new',
    streak: 0,
    bestStreak: 0,
    failStreak: 0,
    lapses: 0,
    stage: 0,
    ease: s.easeInit,
    interval: 0,
    due: 0,
    correctDays: [],
    history: [],
  };
}

export interface ApplyResult {
  next: WordProgress;
  /** 本次答对后刚刚达成"熟练" */
  justMastered: boolean;
  /** 本次答错导致退回"学习中" */
  demoted: boolean;
}

/**
 * 应用一次作答结果，返回新的学习状态。
 * 纯函数：不修改入参，便于单测与回放。
 */
export function applyAnswer(
  prev: WordProgress,
  ok: boolean,
  mode: QuizMode,
  now: number,
  s: Settings = DEFAULT_SETTINGS,
): ApplyResult {
  const next: WordProgress = {
    ...prev,
    failStreak: prev.failStreak ?? 0,
    history: [...prev.history, { t: now, ok, mode }].slice(-40),
    lastReview: now,
    firstSeen: prev.firstSeen ?? now,
  };
  const dk = dateKey(now);
  const relearnAt = now + Math.max(1, s.relearnDelayMinutes) * MINUTE;

  if (ok) {
    next.streak = prev.streak + 1;
    next.bestStreak = Math.max(prev.bestStreak, next.streak);
    next.failStreak = 0;
    next.ease = clamp(prev.ease + s.easeDeltaOk, s.easeMin, s.easeMax);
    if (!next.correctDays.includes(dk)) next.correctDays = [...next.correctDays, dk].slice(-12);
  } else {
    next.streak = 0;
    next.failStreak = (prev.failStreak ?? 0) + 1;
    next.lapses = prev.lapses + 1;
    next.ease = clamp(prev.ease - s.easeDeltaFail, s.easeMin, s.easeMax);
    // 跨天判定必须是「这一轮从零开始的连续正确」，
    // 否则降级后的词可以靠以前积累的正确日期当天重新刷回熟练。
    next.correctDays = [];
  }

  let justMastered = false;
  let demoted = false;
  const maxStage = Math.max(0, (s.intervalDays.length || 1) - 1);

  if (next.state !== 'mastered') {
    const enoughDays = !s.crossSessionMastery || next.correctDays.length >= 2;
    if (next.streak >= s.masteryStreak && enoughDays) {
      next.state = 'mastered';
      next.stage = 0;
      next.interval = intervalForStage(0, next.ease, s);
      next.due = now + next.interval * DAY;
      next.masteredAt = now;
      justMastered = true;
    } else {
      next.state = 'learning';
      next.interval = 0;
      const waitingNextDay = next.streak >= s.masteryStreak && !enoughDays;
      // 已刷满连击但还差跨天验证：安排到次日清晨，而不是当天无限重问
      next.due = waitingNextDay ? nextVerificationAt(now) : ok ? now : relearnAt;
    }
    return { next, justMastered, demoted };
  }

  // 已掌握：按艾宾浩斯阶段推进
  if (ok) {
    const intervalDays = Math.max(0.5, prev.interval || 0.5);
    const overdueRatio = (now - prev.due) / (intervalDays * DAY);

    // 提前复习（例如自己点「错词重练」）说明记忆还在，但不应奖励升阶或改期
    if (overdueRatio < -0.15) {
      next.stage = prev.stage;
      next.interval = prev.interval;
      next.due = prev.due;
      return { next, justMastered, demoted };
    }

    let stage = prev.stage;
    if (overdueRatio > 3) stage = Math.max(0, stage - 1);
    else if (overdueRatio <= 1.5) stage = Math.min(maxStage, stage + 1);
    // 1.5 < overdueRatio <= 3：维持原阶段，记忆已明显衰减
    next.stage = stage;
    next.interval = intervalForStage(stage, next.ease, s);
    next.due = now + next.interval * DAY;
  } else {
    next.stage = Math.max(0, prev.stage - 2);
    next.interval = intervalForStage(next.stage, next.ease, s);
    next.due = relearnAt;
    // 连续多次遗忘 → 退回"学习中"重新刷三连对。
    // 用连续失败而不是累计 lapses：一个词一年里偶发错三次，不该永久一错就降级。
    if (next.failStreak >= DEMOTE_FAIL_STREAK) {
      next.state = 'learning';
      next.stage = 0;
      next.interval = 0;
      next.masteredAt = undefined;
      next.correctDays = [];
      demoted = true;
    }
  }

  return { next, justMastered, demoted };
}

/**
 * 预测当前记忆留存率：R(t) = 0.9^(t / interval)
 * 含义：刚复习完 R≈1；到达下次复习时间点时 R≈0.9。
 */
export function retentionAt(p: WordProgress, now: number, target = 0.9): number {
  if (p.state === 'new') return 0;
  if (!p.lastReview) return 0.5;
  const interval = Math.max(0.5, p.interval || 0.5);
  const elapsedDays = Math.max(0, now - p.lastReview) / DAY;
  return clamp(Math.pow(target, elapsedDays / interval), 0, 1);
}

/** 综合掌握度（0~1），用于词库列表与统计展示 */
export function masteryScore(p: WordProgress, now: number): number {
  if (!p || p.state === 'new') return 0;
  if (p.state === 'ignored') return 1;
  const r = retentionAt(p, now);
  const stagePart = p.state === 'mastered' ? Math.min(1, 0.55 + p.stage * 0.06) : 0.15 + p.streak * 0.12;
  return clamp(stagePart * (0.45 + 0.55 * r), 0, 1);
}

/** 逾期紧迫度：越大越该先复习 */
export function overdueScore(p: WordProgress, now: number): number {
  if (!p.due) return 0;
  const late = now - p.due;
  if (late < 0) return 0;
  const span = Math.max(DAY, (p.interval || 1) * DAY);
  return late / span;
}

export function isDue(p: WordProgress, now: number): boolean {
  if (p.state === 'ignored') return false;
  if (p.state === 'new') return true;
  return p.due <= now;
}

export function stateLabel(state: WordState): string {
  switch (state) {
    case 'new':
      return '未学';
    case 'learning':
      return '学习中';
    case 'mastered':
      return '已掌握';
    case 'ignored':
      return '已会/跳过';
    default:
      return state;
  }
}
