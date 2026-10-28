/**
 * quiz.ts — 题目生成
 *
 * 覆盖 9 种题型（看 / 听 / 选 / 写 / 评），干扰项使用**认知相似度**策略：
 * 优先取自构建期预计算的形近·音近·同性词（word.cf），并按难度系数混合随机词，
 * 同时排除"释义互相包含"的同义候选，避免出现"两个选项都对"的坏题。
 */

import type { Question, QuizMode, RubyPiece, Settings, Word, WordState } from './types';
import { DEFAULT_SETTINGS } from './types';

export interface QuizContext {
  words: Map<string, Word>;
  byBucket: Map<string, Word[]>;
  rng: () => number;
  settings: Settings;
}

/* ------------------------------------------------------------------ 文本工具 */

const KATAKANA = /[゠-ヿ]/g;
const KANJI = /[\u4e00-\u9fff々〆]/;

export function kataToHira(s: string): string {
  return s.replace(KATAKANA, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

/** 归一化假名答案：全角转半角、片假名转平假名、去空格与长音符 */
export function normalizeKana(s: string): string {
  return kataToHira(s)
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\sー\-‐・･]/g, '')
    .trim();
}

/**
 * 罗马字归一化：Hepburn / 训令式 / 全角 / 长音符号都归到同一写法。
 * 例如 si→shi、tu→tsu、ō→ou、shimbun→shinbun。
 */
export function normalizeRomaji(s: string): string {
  return s
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[āīūēō]/g, (ch) => ({ ā: 'aa', ī: 'ii', ū: 'uu', ē: 'ee', ō: 'ou' })[ch] ?? ch)
    .replace(/[\s\-'’]/g, '')
    .replace(/sya/g, 'sha')
    .replace(/syu/g, 'shu')
    .replace(/syo/g, 'sho')
    .replace(/zya/g, 'ja')
    .replace(/zyu/g, 'ju')
    .replace(/zyo/g, 'jo')
    .replace(/tya/g, 'cha')
    .replace(/tyu/g, 'chu')
    .replace(/tyo/g, 'cho')
    .replace(/dya/g, 'ja')
    .replace(/dyu/g, 'ju')
    .replace(/dyo/g, 'jo')
    .replace(/si/g, 'shi')
    .replace(/ti/g, 'chi')
    .replace(/tu/g, 'tsu')
    .replace(/hu/g, 'fu')
    .replace(/zi/g, 'ji')
    .replace(/di/g, 'ji')
    .replace(/mb/g, 'nb')
    .replace(/mp/g, 'np')
    .trim();
}

/** 长音写法在不同输入法下可能是 ou / oo，两种都接受（只用于标准答案侧） */
function romajiVariants(expected: string): string[] {
  const base = normalizeRomaji(expected);
  const out = new Set([base]);
  if (base.includes('ou')) out.add(base.replace(/ou/g, 'oo'));
  if (base.includes('oo')) out.add(base.replace(/oo/g, 'ou'));
  return [...out];
}

/** 是否是纯假名词：这类词的「看词选读音」「看读音选词」会互相泄题 */
export function isKanaOnlyWord(word: Word): boolean {
  return !KANJI.test(word.word);
}

/** 判断两个中文义项是否过于接近（同义/包含），用于排除坏干扰项 */
function glossTooClose(a: string[], b: string[]): boolean {
  for (const x of a) {
    for (const y of b) {
      if (!x || !y) continue;
      if (x === y) return true;
      const head = (t: string) => t.slice(0, Math.max(2, Math.floor(t.length * 0.6)));
      if (head(x) === head(y)) return true;
      if (x.length >= 2 && y.length >= 2 && (x.startsWith(y.slice(0, 2)) && y.startsWith(x.slice(0, 2)))) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ 干扰项 */

type DistKind = 'word' | 'reading' | 'zh';

function acceptable(target: Word, cand: Word, kind: DistKind): boolean {
  if (cand.id === target.id) return false;
  if (kind === 'word') {
    if (cand.word === target.word) return false;
    if (cand.reading === target.reading) return false;
    return true;
  }
  if (kind === 'reading') {
    return cand.reading !== target.reading;
  }
  // zh
  if (!cand.zh.length || !target.zh.length) return false;
  return !glossTooClose(target.zh, cand.zh);
}

function pickDistractors(ctx: QuizContext, target: Word, want: number, kind: DistKind): Word[] {
  const { rng, settings } = ctx;
  const hard = settings.distractorHardness;
  const cf = target.cf.map((id) => ctx.words.get(id)).filter((w): w is Word => !!w);
  const bucketPool = (ctx.byBucket.get(target.bucket) ?? []).filter((w) => w.id !== target.id);
  const all = [...ctx.words.values()].filter((w) => w.id !== target.id);
  const fallback = bucketPool.length ? bucketPool : all;

  const out: Word[] = [];
  const used = new Set<string>([target.id]);
  let guard = 0;
  while (out.length < want && guard++ < 800) {
    const useHard = cf.length > 0 && rng() < hard;
    const src = useHard ? cf : fallback;
    if (!src.length) break;
    const cand = src[Math.floor(rng() * src.length)];
    if (!cand || used.has(cand.id)) continue;
    if (!acceptable(target, cand, kind)) continue;
    used.add(cand.id);
    out.push(cand);
  }
  // 兜底：放宽同义限制再补
  if (out.length < want) {
    for (const cand of fallback) {
      if (out.length >= want) break;
      if (used.has(cand.id)) continue;
      if (cand.word === target.word || cand.reading === target.reading) continue;
      used.add(cand.id);
      out.push(cand);
    }
  }
  return out;
}

function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ------------------------------------------------------------------ 题型生成 */

function needsExample(word: Word, mode: QuizMode): boolean {
  return mode === 'cloze';
}

export function modeAvailable(word: Word, mode: QuizMode): boolean {
  if (needsExample(word, mode)) {
    if (!word.example?.ja) return false;
    return word.example.ja.includes(word.word) || word.example.ja.includes(word.reading);
  }
  if (mode === 'typing') return !!word.reading;
  if (mode === 'zh2jp' || mode === 'audio2zh') return word.zh.length > 0;
  // 纯假名词的「词 ↔ 读音」题会直接把答案显示在题干里
  if ((mode === 'jp2reading' || mode === 'reading2jp') && isKanaOnlyWord(word)) return false;
  return true;
}

/**
 * 不同学习阶段该练什么：
 *  - 新词就混入「看汉字选读音」「看中文想单词」「听音辨词」，避免一直做中文提示四选一；
 *  - 学习中加入拼写与反向回忆，把「认得」推进到「写得出」；
 *  - 已掌握的词以拼写、例句填空等产出型题型为主，避免把「会认」误当「会写」。
 */
const MODE_POOLS: Record<WordState, QuizMode[]> = {
  new: ['jp2zh', 'zh2jp', 'jp2reading', 'audio2jp', 'audio2zh', 'cloze', 'selfRate'],
  learning: ['zh2jp', 'jp2reading', 'audio2jp', 'reading2jp', 'typing', 'jp2zh', 'cloze', 'selfRate'],
  mastered: ['typing', 'cloze', 'zh2jp', 'audio2jp', 'reading2jp', 'jp2reading', 'selfRate'],
  ignored: [],
};

/** 为某个词挑一个题型：优先当前阶段合适的题型，再选当天用得最少的（模态轮换） */
export function chooseMode(
  word: Word,
  enabled: QuizMode[],
  usedCount: Partial<Record<QuizMode, number>>,
  rng: () => number,
  state: WordState = 'new',
): QuizMode | null {
  const avail = enabled.filter((m) => modeAvailable(word, m));
  if (!avail.length) return null;
  const preferred = avail.filter((m) => MODE_POOLS[state].includes(m));
  const pool = preferred.length ? preferred : avail;
  const min = Math.min(...pool.map((m) => usedCount[m] ?? 0));
  const tier = pool.filter((m) => (usedCount[m] ?? 0) === min);
  return tier[Math.floor(rng() * tier.length)];
}

/** 按字符区间裁剪注音分段；只有整段保留时才带上读音，避免把假名对错位 */
function slicePieces(pieces: RubyPiece[] | undefined, start: number, end: number): RubyPiece[] | undefined {
  if (!pieces?.length) return undefined;
  const out: RubyPiece[] = [];
  let offset = 0;
  for (const p of pieces) {
    const ps = offset;
    const pe = offset + p.t.length;
    offset = pe;
    if (pe <= start || ps >= end) continue;
    const l = Math.max(0, start - ps);
    const r = Math.min(p.t.length, end - ps);
    const t = p.t.slice(l, r);
    if (!t) continue;
    const whole = l === 0 && r === p.t.length;
    out.push(whole && p.r ? { t, r: p.r } : { t });
  }
  return out.length ? out : undefined;
}

export function makeQuestion(ctx: QuizContext, word: Word, mode: QuizMode): Question | null {
  const { rng } = ctx;
  const s: Settings = ctx.settings ?? DEFAULT_SETTINGS;
  const nOpt = s.optionCount === 6 ? 6 : 4;
  const want = nOpt - 1;
  const pos = word.pos.join('·');

  const buildChoice = (
    kind: DistKind,
    prompt: string,
    answerText: string,
    extra: Partial<Question> = {},
    promptSub?: string,
  ): Question => {
    const ds = pickDistractors(ctx, word, want, kind);
    const valueOf = (w: Word) => (kind === 'reading' ? w.reading : kind === 'zh' ? w.zh[0] : w.word);
    const opts = [answerText, ...ds.map(valueOf)].filter(Boolean);
    const uniq: string[] = [];
    for (const o of opts) if (!uniq.includes(o)) uniq.push(o);
    const finalOpts = uniq.slice(0, nOpt);
    if (finalOpts.length < 2) return null as unknown as Question;
    shuffleInPlace(finalOpts, rng);
    return {
      wordId: word.id,
      mode,
      kind: 'choice',
      prompt,
      promptSub,
      options: finalOpts,
      answerIndex: finalOpts.indexOf(answerText),
      answerText,
      ...extra,
    };
  };

  const readingHint = [
    s.showFurigana && word.reading !== word.word ? word.reading : '',
    s.showRomaji ? word.romaji : '',
  ]
    .filter(Boolean)
    .join(' · ');

  // 只用第一个义项做题干容易过于笼统（例如「淋」「开」），合并前几条更利于回忆
  const zhPrompt = word.zh.slice(0, 3).join('；');

  switch (mode) {
    case 'jp2zh':
      return buildChoice('zh', word.word, word.zh[0], {}, [readingHint, pos].filter(Boolean).join(' · '));
    case 'zh2jp':
      return buildChoice('word', zhPrompt, word.word, {}, pos);
    case 'jp2reading':
      return buildChoice('reading', word.word, word.reading, {}, '选择正确读音');
    case 'reading2jp':
      return buildChoice('word', word.reading, word.word, {}, pos);
    case 'audio2jp':
      return buildChoice('word', '听发音，选择对应的单词', word.word, { speak: word.reading }, pos);
    case 'audio2zh':
      return buildChoice('zh', '听发音，选择中文含义', word.zh[0], { speak: word.reading }, pos);
    case 'cloze': {
      const ja = word.example?.ja ?? '';
      let idx = ja.indexOf(word.word);
      let key = word.word;
      if (idx < 0) {
        idx = ja.indexOf(word.reading);
        key = word.reading;
      }
      if (idx < 0) return null;
      return buildChoice(
        'word',
        `____`,
        key,
        {
          cloze: {
            before: ja.slice(0, idx),
            after: ja.slice(idx + key.length),
            rubyBefore: slicePieces(word.example?.ruby, 0, idx),
            rubyAfter: slicePieces(word.example?.ruby, idx + key.length, ja.length),
          },
        },
        word.zh.length ? `提示：${word.zh.slice(0, 2).join('；')}` : word.example?.en,
      );
    }
    case 'typing': {
      const answers = [word.reading, word.romaji, kataToHira(word.reading)];
      const meaning = word.zh.length ? word.zh.slice(0, 2).join('；') : (word.en[0] ?? '');
      // 纯假名词：题干只给释义/发音，避免把答案直接印在屏幕上；
      // 汉字词：题干给写法，考「写法 → 读音」，此时不提供考前朗读（会泄题）。
      if (isKanaOnlyWord(word)) {
        return {
          wordId: word.id,
          mode,
          kind: 'typing',
          prompt: meaning,
          promptSub: '听发音或根据释义，写出这个词的假名',
          options: [],
          answerIndex: -1,
          answerText: word.reading,
          typingAnswers: answers,
          speak: word.reading,
        };
      }
      return {
        wordId: word.id,
        mode,
        kind: 'typing',
        prompt: word.word,
        promptSub: `写出假名读音 · ${meaning}`,
        options: [],
        answerIndex: -1,
        answerText: word.reading,
        typingAnswers: answers,
      };
    }
    case 'selfRate':
      return {
        wordId: word.id,
        mode,
        kind: 'self',
        prompt: word.word,
        promptSub: [readingHint, pos].filter(Boolean).join(' · '),
        options: ['认识', '模糊', '不认识'],
        answerIndex: 0,
        answerText: word.zh.join('；'),
        speak: word.reading,
      };
    default:
      return null;
  }
}

/** 校验拼写题作答：假名 / 片假名 / 罗马字（含常见输入法变体）均可 */
export function checkTyping(input: string, q: Question): boolean {
  const answers = q.typingAnswers ?? [];
  const v = normalizeKana(input);
  const r = normalizeRomaji(input);
  for (const a of answers) {
    if (normalizeKana(a) === v) return true;
    if (a && romajiVariants(a).includes(r)) return true;
  }
  return false;
}

/** 判断选择题是否答对 */
export function checkChoice(index: number, q: Question): boolean {
  return index === q.answerIndex;
}
