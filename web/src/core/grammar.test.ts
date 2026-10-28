import { describe, expect, it } from 'vitest';
import {
  GRAMMAR_MASTERY_STREAK,
  applyGrammarAnswer,
  checkGrammarAnswer,
  grammarStats,
  makeGrammarQuestion,
  makeGrammarQuestions,
} from './grammar';
import type { GrammarPoint } from './content-types';
import { makeRng } from './rng';

function point(i: number, level: GrammarPoint['level'] = 'N5'): GrammarPoint {
  return {
    id: `n5-g${i}`,
    level,
    pattern: `〜ぱたーん${i}`,
    meaning: `释义${i}`,
    formation: `动词 + ぱたーん${i}`,
    example: { ja: `これは例${i}です${i}。`, zh: `这是例句${i}。` },
    blank: { s: `これは例${i}___。`, a: `です${i}` },
    note: `说明${i}`,
    tags: ['测试'],
  };
}

const points = Array.from({ length: 12 }, (_, i) => point(i + 1));

describe('makeGrammarQuestion', () => {
  it('三种题型都生成 4 个互不重复的选项，答案下标正确', () => {
    for (const mode of ['pattern2zh', 'zh2pattern', 'cloze'] as const) {
      const q = makeGrammarQuestion(points[0], points, mode, makeRng(7));
      expect(q.options).toHaveLength(4);
      expect(new Set(q.options).size).toBe(4);
      expect(q.options[q.answerIndex]).toBe(q.answerText);
      expect(checkGrammarAnswer(q, q.answerIndex)).toBe(true);
    }
  });

  it('填空答案可以还原完整例句', () => {
    const q = makeGrammarQuestion(points[0], points, 'cloze', makeRng(3));
    expect(q.prompt).toContain('（');
    expect(q.answerText).toBe(points[0].blank.a);
    const restored = points[0].blank.s.replace('___', q.answerText);
    expect(restored).toBe(points[0].example.ja);
  });

  it('练习题数量不超过题库，且语法点不重复', () => {
    const qs = makeGrammarQuestions(points, points, 8, makeRng(11));
    expect(qs).toHaveLength(8);
    expect(new Set(qs.map((q) => q.pointId)).size).toBe(8);
    expect(qs.map((q) => q.mode)).toEqual([
      'pattern2zh',
      'cloze',
      'zh2pattern',
      'pattern2zh',
      'cloze',
      'zh2pattern',
      'pattern2zh',
      'cloze',
    ]);
  });
});

describe('语法进度', () => {
  it('连续答对达到阈值后标记掌握，答错会清零连击但保留掌握状态', () => {
    const q = makeGrammarQuestion(points[0], points, 'pattern2zh', makeRng(1));
    let p = applyGrammarAnswer(undefined, q, true, 1000);
    expect(p.streak).toBe(1);
    expect(p.masteredAt).toBeUndefined();
    p = applyGrammarAnswer(p, q, true, 2000);
    expect(p.streak).toBe(GRAMMAR_MASTERY_STREAK);
    expect(p.masteredAt).toBe(2000);
    p = applyGrammarAnswer(p, q, false, 3000);
    expect(p.streak).toBe(0);
    expect(p.masteredAt).toBe(2000);
    expect(p.wrong).toBe(1);
  });

  it('统计只计入已学点，并汇总对错', () => {
    const q = makeGrammarQuestion(points[0], points, 'pattern2zh', makeRng(1));
    let p = applyGrammarAnswer(undefined, q, true, 1);
    p = applyGrammarAnswer(p, q, true, 2);
    const stats = grammarStats(points, new Map([[p.id, p]]));
    expect(stats.total).toBe(12);
    expect(stats.seen).toBe(1);
    expect(stats.mastered).toBe(1);
    expect(stats.correct).toBe(2);
    expect(stats.wrong).toBe(0);
  });
});
