/** 原创语法 / 阅读 / 听力题目的数据类型（与 data/content/*.json 一一对应） */

import type { Level } from './types';

export interface GrammarPoint {
  id: string;
  level: Level;
  /** 语法形式，如「〜は〜です」 */
  pattern: string;
  /** 中文释义 */
  meaning: string;
  /** 接续方式 */
  formation: string;
  example: { ja: string; zh: string };
  /** 填空练习：s 中有一个 ___，替换为 a 后应精确等于 example.ja */
  blank: { s: string; a: string };
  note: string;
  tags: string[];
}

export type ReadingKind = 'short' | 'medium' | 'info';

export interface ReadingQuestion {
  q: string;
  options: string[];
  answer: number;
  explain: string;
}

export interface ReadingPassage {
  id: string;
  level: Level;
  kind: ReadingKind;
  title: string;
  passage: string;
  questions: ReadingQuestion[];
}

export type ListeningKind = 'point' | 'response';

export interface ListeningItem {
  id: string;
  level: Level;
  type: ListeningKind;
  /** 对话脚本，行首可带「男：」「女：」等说话人标记 */
  script: string;
  question: string;
  options: string[];
  answer: number;
  explain: string;
}

export const READING_KIND_LABEL: Record<ReadingKind, string> = {
  short: '短文理解',
  medium: '中文理解',
  info: '情报检索',
};

export const LISTENING_KIND_LABEL: Record<ListeningKind, string> = {
  point: '课题理解',
  response: '即时应答',
};
