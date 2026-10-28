import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Level, type Word } from './types';
import { checkTyping, makeQuestion, modeAvailable, normalizeRomaji, type QuizContext } from './quiz';
import { makeRng } from './rng';

function mk(id: string, word: string, reading: string, zh: string[], bucket = 'N', cf: string[] = []): Word {
  return {
    id,
    level: 'N5' as Level,
    word,
    reading,
    romaji: reading,
    pos: ['名词'],
    bucket: bucket as never,
    zh,
    en: [],
    example: { ja: `これは${word}です。`, ruby: [{ t: 'これは' }, { t: word, r: reading }, { t: 'です。' }], en: 'x' },
    cf,
    order: parseInt(id.split('-')[1] ?? '0', 10),
  };
}

const words: Word[] = [
  mk('n5-0001', '学校', 'がっこう', ['学校'], 'N', ['n5-0002', 'n5-0003']),
  mk('n5-0002', '先生', 'せんせい', ['老师'], 'N', ['n5-0001']),
  mk('n5-0003', '教室', 'きょうしつ', ['教室'], 'N', ['n5-0001']),
  mk('n5-0004', '学生', 'がくせい', ['学生'], 'N', ['n5-0001']),
  mk('n5-0005', '図書館', 'としょかん', ['图书馆'], 'N', ['n5-0003']),
  mk('n5-0006', '食べる', 'たべる', ['吃'], 'V', []),
  mk('n5-0007', '飲む', 'のむ', ['喝'], 'V', []),
  mk('n5-0008', '大きい', 'おおきい', ['大的'], 'ADJ', []),
];

function ctx(seed = 42): QuizContext {
  const index = new Map(words.map((w) => [w.id, w]));
  const byBucket = new Map<string, Word[]>();
  for (const w of words) {
    const arr = byBucket.get(w.bucket) ?? [];
    arr.push(w);
    byBucket.set(w.bucket, arr);
  }
  return { words: index, byBucket, rng: makeRng(seed), settings: DEFAULT_SETTINGS };
}

describe('选择题生成', () => {
  it('日→中：选项数量正确、无重复、包含正确答案', () => {
    const q = makeQuestion(ctx(), words[0], 'jp2zh')!;
    expect(q.options).toHaveLength(4);
    expect(new Set(q.options).size).toBe(4);
    expect(q.options[q.answerIndex]).toBe('学校');
  });

  it('中→日：干扰项与正确答案不同词、不同读音', () => {
    const q = makeQuestion(ctx(7), words[0], 'zh2jp')!;
    const wrong = q.options.filter((_, i) => i !== q.answerIndex);
    expect(wrong).not.toContain('学校');
    expect(q.options[q.answerIndex]).toBe('学校');
  });

  it('中→日题干合并多个义项，不用单字释义误导用户', () => {
    const w = mk('n5-0204', '浴びる', 'あびる', ['淋浴', '洗澡'], 'V');
    const index = new Map(words.concat([w]).map((x) => [x.id, x]));
    const c: QuizContext = {
      words: index,
      byBucket: new Map([['V', [w]]]),
      rng: makeRng(9),
      settings: DEFAULT_SETTINGS,
    };
    const q = makeQuestion(c, w, 'zh2jp')!;
    expect(q.prompt).toBe('淋浴；洗澡');
  });

  it('日→读音：干扰项读音与正确答案不同', () => {
    const q = makeQuestion(ctx(11), words[0], 'jp2reading')!;
    expect(q.options[q.answerIndex]).toBe('がっこう');
    const wrong = q.options.filter((_, i) => i !== q.answerIndex);
    expect(wrong).not.toContain('がっこう');
  });

  it('6 选项配置生效', () => {
    const c = ctx(3);
    c.settings = { ...DEFAULT_SETTINGS, optionCount: 6 };
    const q = makeQuestion(c, words[0], 'jp2zh')!;
    expect(q.options.length).toBeGreaterThanOrEqual(4);
    expect(q.options.length).toBeLessThanOrEqual(6);
  });

  it('例句填空：题干被挖空且选项含正确词', () => {
    const q = makeQuestion(ctx(), words[0], 'cloze')!;
    expect(q.cloze?.before).toContain('これは');
    expect(q.options[q.answerIndex]).toBe('学校');
    expect(q.promptSub).toContain('提示：学校');
  });

  it('例句填空保留挖空两侧的注音分段', () => {
    const q = makeQuestion(ctx(), words[0], 'cloze')!;
    expect(q.cloze?.rubyBefore?.map((p) => p.t).join('')).toBe('これは');
    expect(q.cloze?.rubyAfter?.map((p) => p.t).join('')).toBe('です。');
  });

  it('看日文选中文时按设置展示读音提示', () => {
    const q = makeQuestion(ctx(), words[0], 'jp2zh')!;
    expect(q.promptSub).toContain('がっこう');
    const c = ctx();
    c.settings = { ...DEFAULT_SETTINGS, showFurigana: false, showRomaji: false };
    expect(makeQuestion(c, words[0], 'jp2zh')!.promptSub).not.toContain('がっこう');
  });

  it('听音题型把假名读音交给 TTS，避免汉字多音字读错', () => {
    const q = makeQuestion(ctx(), words[0], 'audio2jp')!;
    expect(q.speak).toBe('がっこう');
    expect(q.options[q.answerIndex]).toBe('学校');
  });

  it('会朗读的题型一律使用假名，不把汉字直接交给语音引擎', () => {
    for (const mode of ['audio2jp', 'audio2zh', 'typing', 'selfRate'] as const) {
      for (const w of words) {
        const q = makeQuestion(ctx(), w, mode);
        if (q?.speak) expect(q.speak).not.toMatch(/[\u4e00-\u9fff]/);
      }
    }
  });

  it('多次生成的结果会被打乱（不是固定顺序）', () => {
    const orders = new Set<string>();
    for (let s = 1; s <= 12; s++) {
      const q = makeQuestion(ctx(s), words[0], 'jp2zh')!;
      orders.add(q.options.join('|'));
    }
    expect(orders.size).toBeGreaterThan(1);
  });

  it('干扰项默认排除释义高度重合的同义词', () => {
    const syn: Word[] = [
      mk('n5-0101', '勉強', 'べんきょう', ['学习'], 'N'),
      mk('n5-0102', '学習', 'がくしゅう', ['学习'], 'N'),
      mk('n5-0103', '学校', 'がっこう', ['学校'], 'N'),
      mk('n5-0104', '先生', 'せんせい', ['老师'], 'N'),
    ];
    const index = new Map(syn.map((w) => [w.id, w]));
    const byBucket = new Map<string, Word[]>([['N', syn]]);
    const c: QuizContext = { words: index, byBucket, rng: makeRng(5), settings: DEFAULT_SETTINGS };
    const q = makeQuestion(c, syn[0], 'jp2zh')!;
    expect(q.options.filter((o) => o === '学习')).toHaveLength(1);
  });
});

describe('拼写题', () => {
  it('接受平假名、片假名与罗马字三种写法', () => {
    const q = makeQuestion(ctx(), words[0], 'typing')!;
    expect(q.kind).toBe('typing');
    expect(checkTyping('がっこう', q)).toBe(true);
    expect(checkTyping('ガッコウ', q)).toBe(true);
    expect(checkTyping(' がっこう ', q)).toBe(true);
    expect(checkTyping('がこう', q)).toBe(false);
  });

  it('罗马字大小写与空格不敏感', () => {
    const w = mk('n5-0201', '先生', 'せんせい', ['老师'], 'N');
    w.romaji = 'sensei';
    const index = new Map(words.concat([w]).map((x) => [x.id, x]));
    const c: QuizContext = { words: index, byBucket: new Map([['N', words]]), rng: makeRng(1), settings: DEFAULT_SETTINGS };
    const q = makeQuestion(c, w, 'typing')!;
    expect(checkTyping('sensei', q)).toBe(true);
    expect(checkTyping('SENSEI', q)).toBe(true);
    expect(checkTyping('sen sei', q)).toBe(true);
  });

  it('兼容训令式、全角与长音变体', () => {
    expect(normalizeRomaji('ｓｉｎｂｕｎ')).toBe('shinbun');
    expect(normalizeRomaji('simbun')).toBe('shinbun');
    expect(normalizeRomaji('Ōkii')).toBe('oukii');
    const w = mk('n5-0202', '大きい', 'おおきい', ['大的'], 'ADJ');
    w.romaji = 'ookii';
    const c: QuizContext = {
      words: new Map([[w.id, w]]),
      byBucket: new Map([['ADJ', [w]]]),
      rng: makeRng(1),
      settings: DEFAULT_SETTINGS,
    };
    const q = makeQuestion(c, w, 'typing')!;
    expect(checkTyping('oukii', q)).toBe(true);
    expect(checkTyping('ookii', q)).toBe(true);
    expect(checkTyping('ōkii', q)).toBe(true);
  });

  it('纯假名词的拼写题不把答案印在题干上', () => {
    const w = mk('n5-0203', 'あいかわらず', 'あいかわらず', ['照旧'], 'ADV');
    const c: QuizContext = {
      words: new Map([[w.id, w]]),
      byBucket: new Map([['ADV', [w]]]),
      rng: makeRng(1),
      settings: DEFAULT_SETTINGS,
    };
    const q = makeQuestion(c, w, 'typing')!;
    expect(q.prompt).not.toContain('あいかわらず');
    expect(q.promptSub).not.toContain('あいかわらず');
    expect(q.prompt).toContain('照旧');
  });

  it('汉字词的拼写题考前不朗读（朗读会泄露读音）', () => {
    const q = makeQuestion(ctx(), words[0], 'typing')!;
    expect(q.prompt).toBe('学校');
    expect(q.speak).toBeUndefined();
  });
});

describe('题型可用性', () => {
  it('纯假名词不生成「词↔读音」互泄题的题型', () => {
    const w = mk('n5-0301', 'あいかわらず', 'あいかわらず', ['照旧'], 'ADV');
    expect(modeAvailable(w, 'jp2reading')).toBe(false);
    expect(modeAvailable(w, 'reading2jp')).toBe(false);
    expect(modeAvailable(w, 'jp2zh')).toBe(true);
  });
});
