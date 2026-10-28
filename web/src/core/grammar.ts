/** 语法训练：三种题型生成、作答判定与掌握进度 */

import type { GrammarPoint } from './content-types';
import type { Level } from './types';
import { makeRng, shuffle } from './rng';

export type GrammarMode = 'pattern2zh' | 'zh2pattern' | 'cloze';

export const GRAMMAR_MODE_LABEL: Record<GrammarMode, string> = {
  pattern2zh: '看形式选释义',
  zh2pattern: '看释义选形式',
  cloze: '例句填空',
};

const MODES: GrammarMode[] = ['pattern2zh', 'cloze', 'zh2pattern'];

/** 连续答对 2 次即视为掌握：语法点数量少、复习成本低，比词汇更快进入长期记忆 */
export const GRAMMAR_MASTERY_STREAK = 2;

export interface GrammarProgress {
  id: string;
  level: Level;
  seen: number;
  correct: number;
  wrong: number;
  streak: number;
  bestStreak: number;
  lastAt: number;
  masteredAt?: number;
}

export interface GrammarQuestion {
  pointId: string;
  level: Level;
  mode: GrammarMode;
  prompt: string;
  promptSub?: string;
  options: string[];
  answerIndex: number;
  answerText: string;
  explain: string;
  example: { ja: string; zh: string };
  pattern: string;
  meaning: string;
}

function uniqueTake(candidates: string[], exclude: string[], n: number, rng: () => number): string[] {
  const used = new Set(exclude);
  const out: string[] = [];
  for (const c of shuffle(candidates, rng)) {
    const v = c.trim();
    if (!v || used.has(v)) continue;
    used.add(v);
    out.push(v);
    if (out.length >= n) break;
  }
  return out;
}

function explainFor(p: GrammarPoint, mode: GrammarMode): string {
  const core = `${p.pattern}：${p.meaning}。${p.note}`;
  if (mode === 'cloze') return `${core}\n完整例句：${p.example.ja}（${p.example.zh}）`;
  return `${core}\n例句：${p.example.ja}（${p.example.zh}）`;
}

/** 为一个语法点生成指定题型的题目，干扰项来自同级其他语法点 */
export function makeGrammarQuestion(
  point: GrammarPoint,
  pool: GrammarPoint[],
  mode: GrammarMode,
  rng: () => number = Math.random,
): GrammarQuestion {
  const others = pool.filter((p) => p.id !== point.id);
  if (mode === 'cloze') {
    const answer = point.blank.a;
    const distractors = uniqueTake(
      others.map((p) => p.blank.a),
      [answer],
      3,
      rng,
    );
    const options = shuffle([answer, ...distractors], rng);
    return {
      pointId: point.id,
      level: point.level,
      mode,
      prompt: point.blank.s.replace('___', '（　　）'),
      promptSub: point.example.zh,
      options,
      answerIndex: options.indexOf(answer),
      answerText: answer,
      explain: explainFor(point, mode),
      example: point.example,
      pattern: point.pattern,
      meaning: point.meaning,
    };
  }

  if (mode === 'zh2pattern') {
    const answer = point.pattern;
    const distractors = uniqueTake(
      others.map((p) => p.pattern),
      [answer],
      3,
      rng,
    );
    const options = shuffle([answer, ...distractors], rng);
    return {
      pointId: point.id,
      level: point.level,
      mode,
      prompt: point.meaning,
      promptSub: '选择对应的语法形式',
      options,
      answerIndex: options.indexOf(answer),
      answerText: answer,
      explain: explainFor(point, mode),
      example: point.example,
      pattern: point.pattern,
      meaning: point.meaning,
    };
  }

  const answer = point.meaning;
  const distractors = uniqueTake(
    others.map((p) => p.meaning),
    [answer],
    3,
    rng,
  );
  const options = shuffle([answer, ...distractors], rng);
  return {
    pointId: point.id,
    level: point.level,
    mode,
    prompt: point.pattern,
    promptSub: point.formation,
    options,
    answerIndex: options.indexOf(answer),
    answerText: answer,
    explain: explainFor(point, mode),
    example: point.example,
    pattern: point.pattern,
    meaning: point.meaning,
  };
}

/** 抽 count 个语法点，按「形式→释义 / 填空 / 释义→形式」循环出题 */
export function makeGrammarQuestions(
  points: GrammarPoint[],
  pool: GrammarPoint[],
  count: number,
  rng: () => number = Math.random,
): GrammarQuestion[] {
  const picked = shuffle(points, rng).slice(0, Math.min(count, points.length));
  return picked.map((p, i) => makeGrammarQuestion(p, pool, MODES[i % MODES.length], rng));
}

export function checkGrammarAnswer(q: GrammarQuestion, choice: number): boolean {
  return q.answerIndex === choice;
}

export function applyGrammarAnswer(
  prev: GrammarProgress | undefined,
  q: GrammarQuestion,
  ok: boolean,
  now = Date.now(),
): GrammarProgress {
  const streak = ok ? (prev?.streak ?? 0) + 1 : 0;
  const next: GrammarProgress = {
    id: q.pointId,
    level: q.level,
    seen: (prev?.seen ?? 0) + 1,
    correct: (prev?.correct ?? 0) + (ok ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (ok ? 0 : 1),
    streak,
    bestStreak: Math.max(prev?.bestStreak ?? 0, streak),
    lastAt: now,
    masteredAt: prev?.masteredAt,
  };
  if (streak >= GRAMMAR_MASTERY_STREAK && !next.masteredAt) next.masteredAt = now;
  return next;
}

export interface GrammarStats {
  total: number;
  seen: number;
  mastered: number;
  correct: number;
  wrong: number;
}

export function grammarStats(points: GrammarPoint[], progress: Map<string, GrammarProgress>): GrammarStats {
  let seen = 0;
  let mastered = 0;
  let correct = 0;
  let wrong = 0;
  for (const p of points) {
    const g = progress.get(p.id);
    if (!g) continue;
    if (g.seen > 0) seen++;
    if (g.masteredAt) mastered++;
    correct += g.correct;
    wrong += g.wrong;
  }
  return { total: points.length, seen, mastered, correct, wrong };
}

export function grammarRng(seed: number): () => number {
  return makeRng(seed);
}
