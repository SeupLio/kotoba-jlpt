import { describe, expect, it } from 'vitest';
import type { GrammarPoint, ListeningItem, ReadingPassage } from './content-types';
import type { Level, Word } from './types';
import {
  EXAM_LEVEL_INFO,
  buildExamPaper,
  gradeExam,
  listeningScriptLines,
  listeningSpeakText,
  type BuildExamInput,
  type ExamPaper,
  type ExamQuestion,
} from './exam';

function word(i: number, level: Level = 'N5'): Word {
  return {
    id: `${level}-w${i}`,
    level,
    word: `言葉${i}`,
    reading: `ことば${i}`,
    romaji: `kotoba${i}`,
    pos: ['名词'],
    bucket: 'N',
    zh: [`词义${i}`],
    en: [`word ${i}`],
    example: null,
    cf: [],
    order: i,
  };
}

function grammar(i: number, level: Level = 'N5'): GrammarPoint {
  return {
    id: `${level}-g${i}`,
    level,
    pattern: `〜形${i}`,
    meaning: `语法释义${i}`,
    formation: `动词 + 形${i}`,
    example: { ja: `例文${i}です。`, zh: `例句${i}。` },
    blank: { s: `例文${i}___。`, a: `です${i}` },
    note: `说明${i}`,
    tags: ['测试'],
  };
}

function reading(i: number, kind: ReadingPassage['kind'], level: Level = 'N5'): ReadingPassage {
  return {
    id: `${level}-r${i}`,
    level,
    kind,
    title: `文章${i}`,
    passage: `これはテスト用の文章${i}です。`.repeat(5),
    questions: [0, 1].map((j) => ({
      q: `文章${i}的问题${j + 1}`,
      options: ['选项A', '选项B', '选项C', '选项D'],
      answer: j % 4,
      explain: `解析${i}-${j}`,
    })),
  };
}

function listening(i: number, type: ListeningItem['type'], level: Level = 'N5'): ListeningItem {
  return {
    id: `${level}-l${i}`,
    level,
    type,
    script: `男：テスト${i}です。\n女：そうですね。`,
    question: `听力问题${i}`,
    options: ['甲', '乙', '丙', '丁'],
    answer: i % 4,
    explain: `听力解析${i}`,
  };
}

function input(level: Level): BuildExamInput {
  return {
    level,
    words: Array.from({ length: 40 }, (_, i) => word(i + 1, level)),
    grammar: Array.from({ length: 20 }, (_, i) => grammar(i + 1, level)),
    reading: [reading(1, 'short', level), reading(2, 'medium', level), reading(3, 'info', level)],
    listening: [
      listening(1, 'point', level),
      listening(2, 'point', level),
      listening(3, 'point', level),
      listening(4, 'response', level),
      listening(5, 'response', level),
      listening(6, 'response', level),
    ],
    seed: 12345,
    now: 1_700_000_000_000,
  };
}

function allQuestions(paper: ExamPaper): ExamQuestion[] {
  return paper.sections.flatMap((s) => s.questions);
}

describe('buildExamPaper', () => {
  it('同一 seed 生成同一试卷，题目 id 唯一', () => {
    const a = buildExamPaper(input('N5'));
    const b = buildExamPaper(input('N5'));
    expect(a.sections.map((s) => s.questions.map((q) => q.id))).toEqual(
      b.sections.map((s) => s.questions.map((q) => q.id)),
    );
    const ids = allQuestions(a).map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('每道题都有 4 个选项，答案下标有效', () => {
    for (const level of ['N5', 'N3', 'N1'] as Level[]) {
      const paper = buildExamPaper(input(level));
      for (const q of allQuestions(paper)) {
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(q.options.length);
      }
    }
  });

  it('N1–N3 分为言语知识、阅读、听力三部分，N4–N5 合并知识阅读', () => {
    expect(buildExamPaper(input('N1')).sections.map((s) => s.key)).toEqual([
      'knowledge',
      'reading',
      'listening',
    ]);
    expect(buildExamPaper(input('N4')).sections.map((s) => s.key)).toEqual(['knowledge', 'listening']);
    expect(buildExamPaper(input('N4')).sections[0].scoreMax).toBe(120);
  });

  it('阅读题携带原文，听力题携带脚本与播放文本', () => {
    const paper = buildExamPaper(input('N5'));
    const readingQ = allQuestions(paper).find((q) => q.kind === 'reading');
    expect(readingQ && readingQ.kind === 'reading' && readingQ.passage.length).toBeGreaterThan(20);
    const listenQ = allQuestions(paper).find((q) => q.kind === 'listening');
    expect(listenQ && listenQ.kind === 'listening' && listenQ.speakText).toContain('1、');
  });
});

describe('听力脚本处理', () => {
  it('剥离说话人标记，并在播放文本中依次报读选项', () => {
    const lines = listeningScriptLines('男：こんにちは。\n女：こんばんは。');
    expect(lines).toEqual([
      { speaker: '男', text: 'こんにちは。' },
      { speaker: '女', text: 'こんばんは。' },
    ]);
    const item = listening(1, 'point');
    const text = listeningSpeakText(item);
    expect(text).toContain('テスト1です。');
    expect(text).toContain('そうですね。');
    expect(text).toContain('4、丁。');
    expect(text).not.toContain('男：');
  });
});

describe('gradeExam', () => {
  const paper = buildExamPaper(input('N5'));
  const all = allQuestions(paper);
  const answersAllCorrect = Object.fromEntries(all.map((q) => [q.id, q.answerIndex]));
  const timing = { startedAt: 1000, finishedAt: 61_000 };

  it('全对得满分并合格', () => {
    const r = gradeExam(paper, answersAllCorrect, timing);
    expect(r.totalScore).toBe(180);
    expect(r.passed).toBe(true);
    expect(r.unanswered).toBe(0);
    expect(r.spentSec).toBe(60);
  });

  it('全空得 0 分，且单科不达标', () => {
    const r = gradeExam(paper, {}, timing);
    expect(r.totalScore).toBe(0);
    expect(r.passed).toBe(false);
    expect(r.sectionFailed).toBe(true);
    expect(r.unanswered).toBe(paper.totalQuestions);
  });

  it('总分过线但单科低于最低分时仍判不合格', () => {
    const listenIds = new Set(paper.sections.find((s) => s.key === 'listening')!.questions.map((q) => q.id));
    const mostly = Object.fromEntries(
      all.filter((q) => !listenIds.has(q.id)).map((q) => [q.id, q.answerIndex]),
    );
    const r = gradeExam(paper, mostly, timing);
    expect(r.totalScore).toBe(120);
    expect(r.totalScore).toBeGreaterThanOrEqual(paper.passScore);
    expect(r.sectionFailed).toBe(true);
    expect(r.passed).toBe(false);
  });

  it('合格线随等级变化', () => {
    expect(EXAM_LEVEL_INFO.N1.passScore).toBe(100);
    expect(EXAM_LEVEL_INFO.N3.passScore).toBe(95);
    expect(EXAM_LEVEL_INFO.N5.passScore).toBe(80);
    expect(EXAM_LEVEL_INFO.N5.sections[0].minScore).toBe(38);
  });
});
