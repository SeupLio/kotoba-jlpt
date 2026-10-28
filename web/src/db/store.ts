/** 学习数据持久化：进度、设置、每日记录 */

import type { Settings, WordProgress } from '../core/types';
import { DEFAULT_SETTINGS } from '../core/types';
import { STORE, idbBulkPut, idbGet, idbGetAll, idbPut, idbClear } from './idb';
import { dateKey } from '../core/srs';

export interface DailyRecord {
  date: string;
  /** 新学词数 */
  newCount: number;
  /** 复习/巩固题数 */
  reviewCount: number;
  correct: number;
  wrong: number;
  /** 学习时长（秒） */
  seconds: number;
}

export async function loadSettings(): Promise<Settings> {
  const s = await idbGet<Settings>(STORE.settings, 'app');
  if (!s) return { ...DEFAULT_SETTINGS };
  const merged = { ...DEFAULT_SETTINGS, ...s };
  // 引导是后加的字段：已有设置但没有该字段，说明是升级前的老用户，不再打断一次
  if ((s as Partial<Settings>).onboarded === undefined) merged.onboarded = true;
  return merged;
}

export async function saveSettings(s: Settings): Promise<void> {
  await idbPut(STORE.settings, s, 'app');
}

export async function loadProgress(): Promise<Map<string, WordProgress>> {
  const rows = await idbGetAll<WordProgress>(STORE.progress);
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...r,
        failStreak: r.failStreak ?? 0,
        correctDays: r.correctDays ?? [],
        history: r.history ?? [],
      },
    ]),
  );
}

export async function saveProgress(items: WordProgress[]): Promise<void> {
  await idbBulkPut(STORE.progress, items);
}

export async function loadDaily(): Promise<Map<string, DailyRecord>> {
  const rows = await idbGetAll<DailyRecord>(STORE.daily);
  return new Map(rows.map((r) => [r.date, r]));
}

export async function bumpDaily(now: number, patch: Partial<DailyRecord>): Promise<DailyRecord> {
  const key = dateKey(now);
  const cur = (await idbGet<DailyRecord>(STORE.daily, key)) ?? {
    date: key,
    newCount: 0,
    reviewCount: 0,
    correct: 0,
    wrong: 0,
    seconds: 0,
  };
  const next: DailyRecord = {
    ...cur,
    newCount: cur.newCount + (patch.newCount ?? 0),
    reviewCount: cur.reviewCount + (patch.reviewCount ?? 0),
    correct: cur.correct + (patch.correct ?? 0),
    wrong: cur.wrong + (patch.wrong ?? 0),
    seconds: cur.seconds + (patch.seconds ?? 0),
  };
  await idbPut(STORE.daily, next);
  return next;
}

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  settings: Settings;
  progress: WordProgress[];
  daily: DailyRecord[];
}

export async function exportAll(): Promise<ExportBundle> {
  const [settings, progress, daily] = await Promise.all([
    loadSettings(),
    idbGetAll<WordProgress>(STORE.progress),
    idbGetAll<DailyRecord>(STORE.daily),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), settings, progress, daily };
}

export async function importAll(bundle: ExportBundle): Promise<void> {
  if (!bundle || bundle.version !== 1) throw new Error('备份文件格式不正确');
  if (!bundle.settings || typeof bundle.settings !== 'object') throw new Error('备份文件缺少设置');
  if (!Array.isArray(bundle.progress) || !Array.isArray(bundle.daily)) throw new Error('备份文件缺少学习记录');
  // 先清空再写入：否则备份里没有的词会残留旧进度，形成「导入后反而多出记录」的错觉
  await Promise.all([idbClear(STORE.progress), idbClear(STORE.daily)]);
  await idbPut(STORE.settings, { ...DEFAULT_SETTINGS, ...bundle.settings }, 'app');
  await idbBulkPut(STORE.progress, bundle.progress);
  await idbBulkPut(STORE.daily, bundle.daily);
}

export async function resetAll(): Promise<void> {
  await idbClear(STORE.progress);
  await idbClear(STORE.daily);
}
