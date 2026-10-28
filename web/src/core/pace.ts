/**
 * pace.ts — 考试倒计时与每日配速
 *
 * 目标用户最常见的焦虑不是「今天学不学」，而是「离考试还有 40 天，我这样学来得及吗」。
 * 这里把目标日期、剩余词量、当前每日新词量换算成一句可执行的建议。
 */

import type { Settings, Word, WordProgress } from './types';
import { DAY, dayStart } from './srs';

export interface PaceInfo {
  examDate: string;
  /** 距离考试的自然日天数（考试当天为 0，已过期为负数） */
  daysLeft: number;
  /** 所选等级的总词数 */
  total: number;
  mastered: number;
  /** 用户主动标记「已会」而跳过的词，不计入熟练 */
  ignored: number;
  remaining: number;
  /** 扣除「跨天验证」占用后的可学天数，至少 1 */
  studyDays: number;
  /** 按剩余词量/可学天数算出的建议每日新词 */
  recommendedNewPerDay: number;
  /** 按当前每日新词量，覆盖剩余词量所需天数 */
  daysAtCurrentPace: number;
  /** 当前节奏能否在考前覆盖全部词 */
  onTrack: boolean;
}

/** 把 YYYY-MM-DD 解析成本地时区的当天 00:00，避免 UTC 解析造成的差一天 */
export function parseDateKey(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ts = new Date(y, mo - 1, d).getTime();
  if (!Number.isFinite(ts)) return null;
  const check = new Date(ts);
  if (check.getFullYear() !== y || check.getMonth() !== mo - 1 || check.getDate() !== d) return null;
  return ts;
}

export function computePace(
  words: Word[],
  progress: Map<string, WordProgress>,
  settings: Settings,
  now: number,
): PaceInfo | null {
  const examTs = parseDateKey(settings.examDate);
  if (examTs == null) return null;

  const examStart = dayStart(examTs);
  const todayStart = dayStart(now);
  const daysLeft = Math.round((examStart - todayStart) / DAY);

  let mastered = 0;
  let ignored = 0;
  let remaining = 0;
  for (const w of words) {
    const p = progress.get(w.id);
    if (p?.state === 'mastered') mastered++;
    else if (p?.state === 'ignored') ignored++;
    else remaining++;
  }

  // 一个新词至少需要「今天 + 明天」两次到访才能达到跨天三连对，
  // 所以可真正用于铺新词的天数要比倒计时少 1 天（至少保留 1 天）。
  const studyDays = Math.max(1, daysLeft - 1);
  const recommendedNewPerDay = remaining === 0 ? 0 : Math.min(200, Math.max(1, Math.ceil(remaining / studyDays)));
  const daysAtCurrentPace =
    remaining === 0
      ? 0
      : settings.newPerDay > 0
        ? Math.ceil(remaining / settings.newPerDay)
        : Number.POSITIVE_INFINITY;

  return {
    examDate: settings.examDate,
    daysLeft,
    total: words.length,
    mastered,
    ignored,
    remaining,
    studyDays,
    recommendedNewPerDay,
    daysAtCurrentPace,
    onTrack: remaining === 0 || (daysLeft > 0 && daysAtCurrentPace <= studyDays),
  };
}
