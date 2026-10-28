/** 原创语法 / 阅读 / 听力内容加载：内存缓存 + IndexedDB 离线缓存 */

import type { Level } from '../core/types';
import type { GrammarPoint, ListeningItem, ReadingPassage } from '../core/content-types';
import { STORE, idbGet, idbPut } from '../db/idb';

type ContentKind = 'grammar' | 'reading' | 'listening';

const mem = new Map<string, unknown>();

async function loadFile<T>(kind: ContentKind, level: Level): Promise<T[]> {
  const key = `${kind}:${level}`;
  const hit = mem.get(key);
  if (hit) return hit as T[];

  const cached = await idbGet<{ v: number; data: T[] }>(STORE.cache, `content:${key}`).catch(() => undefined);
  if (cached?.data?.length) {
    mem.set(key, cached.data);
    return cached.data;
  }

  const base = (import.meta.env?.BASE_URL as string) || './';
  const url = `${base}data/content/${kind}-${level.toLowerCase()}.json`.replace(/([^:])\/\//g, '$1/');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`内容加载失败：${kind} ${level} (${res.status})`);
  const data = (await res.json()) as T[];
  mem.set(key, data);
  await idbPut(STORE.cache, { v: 1, data }, `content:${key}`).catch(() => undefined);
  return data;
}

export const loadGrammar = (level: Level) => loadFile<GrammarPoint>('grammar', level);
export const loadReading = (level: Level) => loadFile<ReadingPassage>('reading', level);
export const loadListening = (level: Level) => loadFile<ListeningItem>('listening', level);

export interface ContentBundle {
  grammar: GrammarPoint[];
  reading: ReadingPassage[];
  listening: ListeningItem[];
}

export async function loadContent(level: Level): Promise<ContentBundle> {
  const [grammar, reading, listening] = await Promise.all([
    loadGrammar(level),
    loadReading(level),
    loadListening(level),
  ]);
  return { grammar, reading, listening };
}

/** 搜索语法点：形式 / 释义 / 接续 / 例句 / 标签 */
export function searchGrammar(points: GrammarPoint[], q: string): GrammarPoint[] {
  const s = q.trim().toLowerCase();
  if (!s) return points;
  return points.filter(
    (p) =>
      p.pattern.toLowerCase().includes(s) ||
      p.meaning.toLowerCase().includes(s) ||
      p.formation.toLowerCase().includes(s) ||
      p.note.toLowerCase().includes(s) ||
      p.example.ja.toLowerCase().includes(s) ||
      p.example.zh.toLowerCase().includes(s) ||
      p.tags.some((t) => t.toLowerCase().includes(s)),
  );
}
