/** 词库与学习状态的核心类型定义 */

export type Level = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export const LEVELS: Level[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

/** 词性大类，用于干扰项分组 */
export type Bucket = 'N' | 'V' | 'ADJ' | 'ADV' | 'EXP' | 'AFFIX' | 'OTHER';

export interface RubyPiece {
  t: string;
  r?: string;
}

export interface WordExample {
  ja: string;
  ruby?: RubyPiece[];
  en: string;
}

export interface Word {
  id: string;
  level: Level;
  /** 表记（汉字优先，无汉字时为假名） */
  word: string;
  /** 假名读音 */
  reading: string;
  romaji: string;
  /** 中文词性标签 */
  pos: string[];
  bucket: Bucket;
  /** 中文义项 */
  zh: string[];
  /** 英文义项（兜底 / 双语模式） */
  en: string[];
  example?: WordExample | null;
  /** 预计算的易混淆词 id（同等级） */
  cf: string[];
  order: number;
}

/** 题型：覆盖"看、听、选、写、评"五种认知通道 */
export type QuizMode =
  | 'jp2zh' // 看日文 → 选中文
  | 'zh2jp' // 看中文 → 选日文
  | 'audio2jp' // 听读音 → 选日文
  | 'audio2zh' // 听读音 → 选中文
  | 'jp2reading' // 看日文 → 选读音
  | 'reading2jp' // 看假名 → 选日文
  | 'typing' // 听/看释义 → 拼写（假名或罗马字）
  | 'cloze' // 例句填空
  | 'selfRate'; // 卡片自评

export const ALL_MODES: QuizMode[] = [
  'jp2zh',
  'zh2jp',
  'jp2reading',
  'reading2jp',
  'audio2jp',
  'audio2zh',
  'typing',
  'cloze',
  'selfRate',
];

export const MODE_LABEL: Record<QuizMode, string> = {
  jp2zh: '看日文选中文',
  zh2jp: '看中文选日文',
  audio2jp: '听音选日文',
  audio2zh: '听音选中文',
  jp2reading: '看日文选读音',
  reading2jp: '看读音选日文',
  typing: '拼写练习',
  cloze: '例句填空',
  selfRate: '卡片自评',
};

export type WordState = 'new' | 'learning' | 'mastered' | 'ignored';

/** 个性化强调色：朱、靛、松、梅 */
export type AccentKey = 'vermilion' | 'indigo' | 'moss' | 'plum';

export interface AnswerLog {
  t: number;
  ok: boolean;
  mode: QuizMode;
}

export interface WordProgress {
  id: string;
  level: Level;
  state: WordState;
  /** 连续正确次数 */
  streak: number;
  bestStreak: number;
  /** 连续答错次数（答对即清零，用于判定顽固词与退级） */
  failStreak: number;
  /** 累计遗忘（答错）次数 */
  lapses: number;
  /** 艾宾浩斯阶段下标 */
  stage: number;
  /** 难度因子 */
  ease: number;
  /** 当前间隔（天） */
  interval: number;
  /** 下次到期时间戳（ms） */
  due: number;
  lastReview?: number;
  firstSeen?: number;
  masteredAt?: number;
  /** 正确过的不同日期，格式 YYYY-MM-DD，最多保留最近 10 个 */
  correctDays: string[];
  history: AnswerLog[];
  favorite?: boolean;
  /** 个人笔记，本地保存，可被词库搜索 */
  note?: string;
  /** 个人释义：非空时覆盖词库释义用于练习与展示 */
  customZh?: string[];
}

export interface Settings {
  levels: Level[];
  /** 是否完成首次引导（老用户自动视为已完成） */
  onboarded: boolean;
  /** 目标考试日期（YYYY-MM-DD，空串表示未设置） */
  examDate: string;
  /** 上次导出备份的时间戳 */
  lastBackupAt: number;
  /** 每日新学词数 */
  newPerDay: number;
  /** 每日复习上限 */
  maxReviewPerDay: number;
  /** 判定熟练所需的连续正确次数（默认 3） */
  masteryStreak: number;
  /** 是否要求"三连对"跨天（防止同场次瞬时记忆） */
  crossSessionMastery: boolean;
  /** 艾宾浩斯间隔序列（天） */
  intervalDays: number[];
  easeInit: number;
  easeMin: number;
  easeMax: number;
  /** 答对时 ease 增量 */
  easeDeltaOk: number;
  /** 答错时 ease 减量 */
  easeDeltaFail: number;
  /** 答错后重新出现的延迟（分钟） */
  relearnDelayMinutes: number;
  modes: QuizMode[];
  optionCount: 4 | 6;
  /** 干扰项强度：0=随机，1=优先形近音近 */
  distractorHardness: number;
  showFurigana: boolean;
  showRomaji: boolean;
  autoSpeak: boolean;
  speechRate: number;
  theme: 'light' | 'dark';
  /** 强调色，影响按钮、印章与进度 */
  accent: AccentKey;
  /** 和纸肌理背景 */
  paperTexture: boolean;
  /** 学习页沉浸背景 */
  immersiveStudy: boolean;
  /** 学习页大字模式 */
  largeType: boolean;
  /** 新词抽取顺序 */
  orderStrategy: 'sequential' | 'random';
  /** 每个词在一天内最多连续出现次数 */
  maxRepeatPerWord: number;
}

export const DEFAULT_SETTINGS: Settings = {
  levels: ['N5'],
  onboarded: false,
  examDate: '',
  lastBackupAt: 0,
  newPerDay: 20,
  maxReviewPerDay: 100,
  masteryStreak: 3,
  crossSessionMastery: true,
  intervalDays: [1, 2, 4, 7, 15, 30, 60, 120, 240],
  easeInit: 2.5,
  easeMin: 1.3,
  easeMax: 2.8,
  easeDeltaOk: 0.08,
  easeDeltaFail: 0.2,
  relearnDelayMinutes: 10,
  modes: ['jp2zh', 'zh2jp', 'jp2reading', 'audio2jp', 'typing', 'cloze'],
  optionCount: 4,
  distractorHardness: 0.7,
  showFurigana: true,
  showRomaji: false,
  autoSpeak: false,
  speechRate: 0.9,
  theme: 'light',
  accent: 'vermilion',
  paperTexture: true,
  immersiveStudy: true,
  largeType: false,
  orderStrategy: 'sequential',
  maxRepeatPerWord: 3,
};

export type QuestionKind = 'choice' | 'typing' | 'self';

export interface Question {
  wordId: string;
  mode: QuizMode;
  kind: QuestionKind;
  /** 题干主文本 */
  prompt: string;
  promptSub?: string;
  /** 需要朗读的文本（音频类题型） */
  speak?: string;
  options: string[];
  answerIndex: number;
  /** 拼写的标准答案（typing） */
  typingAnswers?: string[];
  /** 例句填空上下文（ruby 为挖空后保留的注音分段） */
  cloze?: { before: string; after: string; rubyBefore?: RubyPiece[]; rubyAfter?: RubyPiece[] };
  /** 展示用的正确答案文本 */
  answerText: string;
}

export interface SessionItem {
  wordId: string;
  mode: QuizMode;
  /** 来源：新学 / 巩固 / 复习 */
  source: 'new' | 'learning' | 'review';
}
