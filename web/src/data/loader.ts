/** 词库加载与索引（按等级懒加载，内存缓存） */

import type { Level, Word } from '../core/types';
import { STORE, idbGet, idbPut } from '../db/idb';

const mem = new Map<Level, Word[]>();

export async function loadLevel(level: Level): Promise<Word[]> {
  const hit = mem.get(level);
  if (hit) return hit;
  // 优先读离线缓存（PWA / Capacitor 离线可用）
  const cached = await idbGet<{ v: number; data: Word[] }>(STORE.cache, `words:${level}`).catch(() => undefined);
  if (cached?.data?.length) {
    mem.set(level, cached.data);
    return cached.data;
  }
  const base = (import.meta.env?.BASE_URL as string) || './';
  const url = `${base}data/${level.toLowerCase()}.json`.replace(/([^:])\/\//g, '$1/');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`词库加载失败：${level} (${res.status})`);
  const data = (await res.json()) as Word[];
  mem.set(level, data);
  await idbPut(STORE.cache, { v: 1, data }, `words:${level}`).catch(() => undefined);
  return data;
}

export interface LevelBundle {
  words: Word[];
  index: Map<string, Word>;
  byBucket: Map<string, Word[]>;
}

export async function loadLevels(levels: Level[]): Promise<LevelBundle> {
  const parts = await Promise.all(levels.map(loadLevel));
  const words = parts.flat();
  const index = new Map(words.map((w) => [w.id, w]));
  const byBucket = new Map<string, Word[]>();
  for (const w of words) {
    const arr = byBucket.get(w.bucket) ?? [];
    arr.push(w);
    byBucket.set(w.bucket, arr);
  }
  return { words, index, byBucket };
}

/** 搜索：匹配表记 / 读音 / 罗马字 / 中文 / 英文 / 可选附加文本（个人笔记） */
export function searchWords(
  words: Word[],
  q: string,
  limit = 80,
  extraText?: (w: Word) => string,
): Word[] {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const out: Word[] = [];
  for (const w of words) {
    if (
      w.word.includes(s) ||
      w.reading.includes(s) ||
      w.romaji.toLowerCase().includes(s) ||
      w.zh.some((z) => z.includes(s)) ||
      w.en.some((e) => e.toLowerCase().includes(s)) ||
      (extraText?.(w) ?? '').toLowerCase().includes(s)
    ) {
      out.push(w);
      if (out.length >= limit) break;
    }
  }
  return out;
}
