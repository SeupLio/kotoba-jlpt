/**
 * 原创压缩模考引擎。
 *
 * 结构与合格线参照 JLPT 公开信息，题目全部来自本项目原创题库，不含官方真题。
 * 由于原创听力/阅读体量小于真实试卷，考试时长按题量等比压缩，并在界面上明确标注。
 */

import type { Level, Word } from './types';
import type {
  GrammarPoint,
  ListeningItem,
  ListeningKind,
  ReadingKind,
  ReadingPassage,
} from './content-types';
import { LISTENING_KIND_LABEL, READING_KIND_LABEL } from './content-types';
import { makeGrammarQuestions, type GrammarMode } from './grammar';
import { makeRng, sampleN, shuffle } from './rng';

export type ExamSectionKey = 'knowledge' | 'reading' | 'listening';

export interface ExamSectionSpec {
  key: ExamSectionKey;
  label: string;
  short: string;
  scoreMax: number;
  minScore: number;
}

export interface ExamLevelInfo {
  level: Level;
  passScore: number;
  totalScore: number;
  /** 官方单科最低要求（按 60 分制） */
  sectionMin: number;
  /** 官方各科目时长（分钟），仅用于说明真实考场 */
  official: { written: number; listening: number };
  sections: ExamSectionSpec[];
}

export const EXAM_LEVEL_INFO: Record<Level, ExamLevelInfo> = {
  N1: {
    level: 'N1',
    passScore: 100,
    totalScore: 180,
    sectionMin: 19,
    official: { written: 110, listening: 55 },
    sections: [
      { key: 'knowledge', label: '言語知識（文字・語彙・文法）', short: '言語知識', scoreMax: 60, minScore: 19 },
      { key: 'reading', label: '読解', short: '読解', scoreMax: 60, minScore: 19 },
      { key: 'listening', label: '聴解', short: '聴解', scoreMax: 60, minScore: 19 },
    ],
  },
  N2: {
    level: 'N2',
    passScore: 90,
    totalScore: 180,
    sectionMin: 19,
    official: { written: 105, listening: 50 },
    sections: [
      { key: 'knowledge', label: '言語知識（文字・語彙・文法）', short: '言語知識', scoreMax: 60, minScore: 19 },
      { key: 'reading', label: '読解', short: '読解', scoreMax: 60, minScore: 19 },
      { key: 'listening', label: '聴解', short: '聴解', scoreMax: 60, minScore: 19 },
    ],
  },
  N3: {
    level: 'N3',
    passScore: 95,
    totalScore: 180,
    sectionMin: 19,
    official: { written: 100, listening: 40 },
    sections: [
      { key: 'knowledge', label: '言語知識（文字・語彙・文法）', short: '言語知識', scoreMax: 60, minScore: 19 },
      { key: 'reading', label: '読解', short: '読解', scoreMax: 60, minScore: 19 },
      { key: 'listening', label: '聴解', short: '聴解', scoreMax: 60, minScore: 19 },
    ],
  },
  N4: {
    level: 'N4',
    passScore: 90,
    totalScore: 180,
    sectionMin: 19,
    official: { written: 80, listening: 35 },
    sections: [
      { key: 'knowledge', label: '言語知識・読解', short: '知識・読解', scoreMax: 120, minScore: 38 },
      { key: 'listening', label: '聴解', short: '聴解', scoreMax: 60, minScore: 19 },
    ],
  },
  N5: {
    level: 'N5',
    passScore: 80,
    totalScore: 180,
    sectionMin: 19,
    official: { written: 60, listening: 30 },
    sections: [
      { key: 'knowledge', label: '言語知識・読解', short: '知識・読解', scoreMax: 120, minScore: 38 },
      { key: 'listening', label: '聴解', short: '聴解', scoreMax: 60, minScore: 19 },
    ],
  },
};

/* ------------------------------------------------------------ 题目 */

interface QuestionBase {
  id: string;
  prompt: string;
  promptSub?: string;
  options: string[];
  answerIndex: number;
  explain: string;
}

export interface VocabExamQuestion extends QuestionBase {
  kind: 'vocab';
  mode: 'jp2zh' | 'jp2reading';
  wordId: string;
  word: string;
  reading: string;
}

export interface GrammarExamQuestion extends QuestionBase {
  kind: 'grammar';
  mode: GrammarMode;
  pointId: string;
  pattern: string;
  example: { ja: string; zh: string };
}

export interface ReadingExamQuestion extends QuestionBase {
  kind: 'reading';
  passageId: string;
  passageTitle: string;
  passageKind: ReadingKind;
  passage: string;
  qIndex: number;
}

export interface ListeningExamQuestion extends QuestionBase {
  kind: 'listening';
  itemId: string;
  listeningType: ListeningKind;
  script: string;
  speakText: string;
}

export type ExamQuestion =
  | VocabExamQuestion
  | GrammarExamQuestion
  | ReadingExamQuestion
  | ListeningExamQuestion;

export interface ExamSection {
  key: ExamSectionKey;
  label: string;
  short: string;
  instruction: string;
  scoreMax: number;
  minScore: number;
  minutes: number;
  questions: ExamQuestion[];
}

export interface ExamPaper {
  id: string;
  level: Level;
  seed: number;
  createdAt: number;
  sections: ExamSection[];
  totalQuestions: number;
  totalMinutes: number;
  totalMax: number;
  passScore: number;
}

export interface BuildExamInput {
  level: Level;
  words: Word[];
  grammar: GrammarPoint[];
  reading: ReadingPassage[];
  listening: ListeningItem[];
  seed?: number;
  now?: number;
}

const VOCAB_COUNT = 16;
const GRAMMAR_COUNT = 12;
const READING_PASSAGE_COUNT = 2;

function vocabQuestion(w: Word, pool: Word[], mode: 'jp2zh' | 'jp2reading', rng: () => number): VocabExamQuestion {
  const isZh = mode === 'jp2zh';
  const answer = isZh ? w.zh[0] ?? w.en[0] ?? '' : w.reading;
  const candidates = isZh
    ? pool.map((x) => x.zh[0] ?? x.en[0] ?? '')
    : pool.map((x) => x.reading);
  const used = new Set([answer]);
  const distractors: string[] = [];
  for (const c of shuffle(candidates, rng)) {
    if (!c || used.has(c)) continue;
    used.add(c);
    distractors.push(c);
    if (distractors.length >= 3) break;
  }
  const options = shuffle([answer, ...distractors], rng);
  return {
    kind: 'vocab',
    id: `v:${w.id}`,
    mode,
    wordId: w.id,
    word: w.word,
    reading: w.reading,
    prompt: w.word,
    promptSub: isZh ? '选择最接近的中文释义' : '选择正确的读音',
    options,
    answerIndex: options.indexOf(answer),
    explain: `${w.word}（${w.reading}）：${w.zh.join('；')}${w.en.length ? `\nEN: ${w.en.join('; ')}` : ''}`,
  };
}

function pickReading(reading: ReadingPassage[], rng: () => number): ReadingPassage[] {
  if (reading.length <= READING_PASSAGE_COUNT) return shuffle(reading, rng);
  const short = reading.filter((r) => r.kind === 'short');
  const first = short.length ? sampleN(short, 1, rng)[0] : sampleN(reading, 1, rng)[0];
  const rest = reading.filter((r) => r.id !== first.id);
  return [first, ...sampleN(rest, READING_PASSAGE_COUNT - 1, rng)];
}

function buildReadingQuestions(passages: ReadingPassage[]): ReadingExamQuestion[] {
  const out: ReadingExamQuestion[] = [];
  for (const p of passages) {
    p.questions.forEach((q, i) => {
      out.push({
        kind: 'reading',
        id: `r:${p.id}:${i}`,
        passageId: p.id,
        passageTitle: p.title,
        passageKind: p.kind,
        passage: p.passage,
        qIndex: i,
        prompt: q.q,
        promptSub: `${p.title} · ${READING_KIND_LABEL[p.kind]}`,
        options: q.options,
        answerIndex: q.answer,
        explain: q.explain,
      });
    });
  }
  return out;
}

const SPEAKER_RE = /^(男|女|店員|学生|先生|客|部下|上司|アナウンス|ナレーション|子供|母親|父親)[：:]\s*/;

export function listeningScriptLines(script: string): { speaker?: string; text: string }[] {
  return script
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(SPEAKER_RE);
      return m ? { speaker: m[1], text: line.replace(SPEAKER_RE, '') } : { text: line };
    });
}

/** 听力播放文本：脚本 + 依次报读选项，模拟真实考试的语音流程 */
export function listeningSpeakText(item: ListeningItem): string {
  const body = listeningScriptLines(item.script)
    .map((l) => l.text)
    .join('');
  const options = item.options.map((o, i) => `${i + 1}、${o}`).join('。');
  return `${body}${body.endsWith('。') ? '' : '。'}${options}。`;
}

function buildListeningQuestions(items: ListeningItem[]): ListeningExamQuestion[] {
  const order: ListeningKind[] = ['point', 'response'];
  const sorted = [...items].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return sorted.map((item) => ({
    kind: 'listening',
    id: `l:${item.id}`,
    itemId: item.id,
    listeningType: item.type,
    script: item.script,
    speakText: listeningSpeakText(item),
    prompt: item.question,
    promptSub: LISTENING_KIND_LABEL[item.type],
    options: item.options,
    answerIndex: item.answer,
    explain: item.explain,
  }));
}

/** 生成一份完整试卷（纯函数，可复现） */
export function buildExamPaper(input: BuildExamInput): ExamPaper {
  const { level, words, grammar, reading, listening } = input;
  const seed = input.seed ?? Math.floor(Math.random() * 0xffffffff);
  const now = input.now ?? Date.now();
  const rng = makeRng(seed);

  const levelWords = words.filter((w) => w.level === level);
  if (levelWords.length < 8) throw new Error(`${level} 词库不足，无法生成试卷`);
  if (grammar.length < 4) throw new Error(`${level} 语法题库不足，无法生成试卷`);
  if (!reading.length) throw new Error(`${level} 阅读题库不足，无法生成试卷`);
  if (listening.length < 2) throw new Error(`${level} 听力题库不足，无法生成试卷`);

  const vocabWords = sampleN(levelWords, Math.min(VOCAB_COUNT, levelWords.length), rng);
  const vocab = vocabWords.map((w, i) =>
    vocabQuestion(w, levelWords, i % 4 === 3 ? 'jp2reading' : 'jp2zh', rng),
  );

  const grammarQs = makeGrammarQuestions(grammar, grammar, Math.min(GRAMMAR_COUNT, grammar.length), rng).map(
    (q): GrammarExamQuestion => ({
      kind: 'grammar',
      id: `g:${q.pointId}:${q.mode}`,
      mode: q.mode,
      pointId: q.pointId,
      pattern: q.pattern,
      example: q.example,
      prompt: q.prompt,
      promptSub: q.promptSub,
      options: q.options,
      answerIndex: q.answerIndex,
      explain: q.explain,
    }),
  );

  const readingQs = buildReadingQuestions(pickReading(reading, rng));
  const listeningQs = buildListeningQuestions(listening);
  const info = EXAM_LEVEL_INFO[level];
  const hasSeparateReading = info.sections.some((s) => s.key === 'reading');

  const knowledgeQuestions: ExamQuestion[] = hasSeparateReading
    ? [...vocab, ...grammarQs]
    : [...vocab, ...grammarQs, ...readingQs];

  const knowledgeMinutes = Math.max(
    8,
    Math.round(
      vocab.length * 0.9 + grammarQs.length * 1.1 + (hasSeparateReading ? 0 : readingQs.length * 2.2),
    ),
  );
  const readingMinutes = Math.max(5, Math.round(readingQs.length * 2.2));
  const listeningMinutes = Math.max(4, Math.round(listeningQs.length * 1.5));

  const sections: ExamSection[] = info.sections.map((spec) => {
    if (spec.key === 'listening') {
      return {
        ...spec,
        instruction: '听力只播放一次，不能重听；播放结束后作答。',
        minutes: listeningMinutes,
        questions: listeningQs,
      };
    }
    if (spec.key === 'reading') {
      return {
        ...spec,
        instruction: '阅读部分提交后不可返回；计时结束自动提交。',
        minutes: readingMinutes,
        questions: readingQs,
      };
    }
    return {
      ...spec,
      instruction: hasSeparateReading
        ? '文字・語彙・文法部分提交后不可返回；计时结束自动提交。'
        : '言语知识・阅读合并计时，提交后不可返回；计时结束自动提交。',
      minutes: knowledgeMinutes,
      questions: knowledgeQuestions,
    };
  });

  const totalQuestions = sections.reduce((s, x) => s + x.questions.length, 0);
  return {
    id: `${level}-${seed.toString(36)}-${now.toString(36)}`,
    level,
    seed,
    createdAt: now,
    sections,
    totalQuestions,
    totalMinutes: sections.reduce((s, x) => s + x.minutes, 0),
    totalMax: info.totalScore,
    passScore: info.passScore,
  };
}

/* ------------------------------------------------------------ 评分 */

export interface ExamSectionResult {
  key: ExamSectionKey;
  label: string;
  short: string;
  correct: number;
  total: number;
  score: number;
  max: number;
  min: number;
  passed: boolean;
}

export interface ExamResult {
  paperId: string;
  level: Level;
  seed: number;
  startedAt: number;
  finishedAt: number;
  spentSec: number;
  sections: ExamSectionResult[];
  totalScore: number;
  totalMax: number;
  passScore: number;
  passed: boolean;
  sectionFailed: boolean;
  unanswered: number;
  answers: Record<string, number | null>;
}

export function gradeExam(
  paper: ExamPaper,
  answers: Record<string, number | null>,
  timing: { startedAt: number; finishedAt: number },
): ExamResult {
  const sections: ExamSectionResult[] = paper.sections.map((sec) => {
    const correct = sec.questions.reduce((n, q) => n + (answers[q.id] === q.answerIndex ? 1 : 0), 0);
    const score = sec.questions.length ? Math.round((correct / sec.questions.length) * sec.scoreMax) : 0;
    return {
      key: sec.key,
      label: sec.label,
      short: sec.short,
      correct,
      total: sec.questions.length,
      score,
      max: sec.scoreMax,
      min: sec.minScore,
      passed: score >= sec.minScore,
    };
  });
  const totalScore = sections.reduce((s, x) => s + x.score, 0);
  const sectionFailed = sections.some((s) => !s.passed);
  const unanswered = paper.sections.reduce(
    (n, sec) => n + sec.questions.filter((q) => answers[q.id] === undefined || answers[q.id] === null).length,
    0,
  );
  return {
    paperId: paper.id,
    level: paper.level,
    seed: paper.seed,
    startedAt: timing.startedAt,
    finishedAt: timing.finishedAt,
    spentSec: Math.max(0, Math.round((timing.finishedAt - timing.startedAt) / 1000)),
    sections,
    totalScore,
    totalMax: paper.totalMax,
    passScore: paper.passScore,
    passed: totalScore >= paper.passScore && !sectionFailed,
    sectionFailed,
    unanswered,
    answers,
  };
}

export interface ExamRecord extends ExamResult {
  id: string;
}

export function toExamRecord(result: ExamResult): ExamRecord {
  return { ...result, id: result.paperId };
}

/** 分:秒 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function questionKindLabel(q: ExamQuestion): string {
  if (q.kind === 'vocab') return q.mode === 'jp2zh' ? '词汇 · 释义' : '词汇 · 读音';
  if (q.kind === 'grammar') return `语法 · ${q.mode === 'cloze' ? '填空' : q.mode === 'zh2pattern' ? '释义选形式' : '形式选释义'}`;
  if (q.kind === 'reading') return `阅读 · ${READING_KIND_LABEL[q.passageKind]}`;
  return `听力 · ${LISTENING_KIND_LABEL[q.listeningType]}`;
}
