import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Question, QuizMode, Settings, Word, WordProgress, WordState } from '../core/types';
import type { SessionItem } from '../core/types';
import type { LevelBundle } from '../data/loader';
import {
  checkChoice,
  checkTyping,
  chooseMode,
  makeQuestion,
  modeAvailable,
  type QuizContext,
} from '../core/quiz';
import { applyAnswer, needsNextDayCheck, newProgress } from '../core/srs';
import { deferItem, type Plan } from '../core/scheduler';
import { makeRng } from '../core/rng';
import { haptic, hideKeyboard } from '../platform/native';
import { GlossList, PosTags, Ruby, WordDetail } from '../components/ui';
import {
  IconCheck,
  IconClose,
  IconCross,
  IconDone,
  IconEye,
  IconUndo,
  IconVolume,
} from '../components/icons';

interface QueueItem extends SessionItem {
  uid: number;
  /** 本轮该词已出现（作答）次数，用于限制同场次重复 */
  attempts: number;
}

interface AnswerState {
  ok: boolean;
  chosen: number | string;
  revealed: boolean;
  next: WordProgress;
  justMastered: boolean;
  waiting: boolean;
  insertedUid?: number;
}

interface AnswerRecord {
  wordId: string;
  source: SessionItem['source'];
  ok: boolean;
  revealed: boolean;
  justMastered: boolean;
  waiting: boolean;
  mode: QuizMode;
  insertedUid?: number;
}

export interface StudySummary {
  done: number;
  correct: number;
  newDone: number;
  reviewDone: number;
  mastered: number;
  seconds: number;
}

interface Props {
  plan: Plan;
  bundle: LevelBundle;
  settings: Settings;
  progress: Map<string, WordProgress>;
  updateProgress: (items: WordProgress[]) => void;
  onFinish: (s: StudySummary) => void;
  onExit: () => void;
  onStats?: () => void;
  onToast?: (msg: string) => void;
  speak: (t: string) => void;
}

export function Study({
  plan,
  bundle,
  settings,
  progress,
  updateProgress,
  onFinish,
  onExit,
  onStats,
  onToast,
  speak,
}: Props) {
  const rng = useMemo(() => makeRng(Date.now() >>> 0), []);
  const ctx: QuizContext = useMemo(
    () => ({ words: bundle.index, byBucket: bundle.byBucket, rng, settings }),
    [bundle, rng, settings],
  );
  const uidSeq = useRef(1);

  const [queue, setQueue] = useState<QueueItem[]>(() =>
    plan.queue.map((i) => ({ ...i, uid: uidSeq.current++, attempts: 0 })),
  );
  const [pos, setPos] = useState(0);
  const [q, setQ] = useState<Question | null>(null);
  const [answer, setAnswer] = useState<AnswerState | null>(null);
  const [typed, setTyped] = useState('');
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [previewDone, setPreviewDone] = useState<Set<number>>(() => new Set());
  const [showSummary, setShowSummary] = useState(false);
  const startedAt = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  /** 提交时先暂存进度，点「下一个」才落库，这样反馈阶段可以一键撤销 */
  const pending = useRef<WordProgress | null>(null);
  const answersRef = useRef<AnswerRecord[]>([]);
  const skippedRef = useRef<string[]>([]);
  const submitted = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const item = queue[pos];
  const word = item ? bundle.index.get(item.wordId) : undefined;
  const p = item ? progress.get(item.wordId) : undefined;
  const isFresh =
    !!item && item.source === 'new' && item.attempts === 0 && (!p || p.state === 'new');
  const previewing = !!item && isFresh && !previewDone.has(item.uid);

  const correctCount = answers.filter((a) => a.ok).length;
  const wrongCount = answers.length - correctCount;

  /* ------------------------------------------------ 生成当前题目 */
  // 用 layout effect：题目生成前不绘制，否则「中文选日文 / 听音选词」会闪一帧答案
  useLayoutEffect(() => {
    if (!item || previewing) return;
    const w = bundle.index.get(item.wordId);
    if (!w) {
      setPos((v) => v + 1);
      return;
    }
    let question = makeQuestion(ctx, w, item.mode);
    if (!question) question = makeQuestion(ctx, w, 'jp2zh');
    setQ(question);
    setAnswer(null);
    setTyped('');
    if (question?.speak && (settings.autoSpeak || question.mode.startsWith('audio'))) {
      const t = window.setTimeout(() => speak(question.speak as string), 220);
      return () => window.clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.uid, previewing]);

  /* ------------------------------------------------ 本轮收尾 */
  const finalize = useCallback((secs: number) => {
    if (submitted.current) return;
    submitted.current = true;
    if (answersRef.current.length) {
      onFinishRef.current(buildSummary(answersRef.current, secs));
    }
  }, []);

  const commit = useCallback(() => {
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    updateProgress([next]);
  }, [updateProgress]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (item) return;
    const secs = Math.round((Date.now() - startedAt.current) / 1000);
    setSeconds(secs);
    finalize(secs);
  }, [item, finalize]);

  /** 组件被系统返回键等方式直接卸载时，也要保住最后一道题并结算 */
  useEffect(() => {
    // StrictMode 的模拟卸载会先触发一次清理，重挂时允许后续真正收尾
    submitted.current = false;
    return () => {
      if (pending.current) {
        const next = pending.current;
        pending.current = null;
        updateProgress([next]);
      }
      finalize(Math.round((Date.now() - startedAt.current) / 1000));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exitAndSave = useCallback(() => {
    commit();
    finalize(Math.round((Date.now() - startedAt.current) / 1000));
    void hideKeyboard();
    if (answersRef.current.length) {
      setShowSummary(true);
    } else {
      onExit();
    }
  }, [commit, finalize, onExit]);

  /* ------------------------------------------------ 作答 */
  const submit = useCallback(
    (ok: boolean, chosen: number | string, revealed = false) => {
      if (!item || !q || answer) return;
      const w = bundle.index.get(item.wordId) as Word;
      const now = Date.now();
      const prev = progress.get(item.wordId) ?? newProgress(item.wordId, w.level, settings);
      const { next, justMastered } = applyAnswer(prev, ok, q.mode, now, settings);
      pending.current = next;

      const waiting = needsNextDayCheck(next, settings);
      const cap = Math.max(1, settings.maxRepeatPerWord);
      const canRepeat = item.attempts + 1 < cap;
      const shouldRepeat = ok
        ? next.state === 'learning' && !waiting && next.streak < settings.masteryStreak && canRepeat
        : canRepeat;

      let insertedUid: number | undefined;
      if (shouldRepeat) {
        insertedUid = uidSeq.current++;
        // 答错后的纠正用「学习中」题型（认义/读音），别一上来就默写
        const retryState: WordState = !ok ? (prev.state === 'new' ? 'new' : 'learning') : next.state;
        const again: QueueItem = {
          ...item,
          uid: insertedUid,
          attempts: item.attempts + 1,
          mode: retryMode(w, q.mode, retryState, settings, rng),
        };
        setQueue((old) => insertWithGap(old, pos, again));
      }

      const rec: AnswerRecord = {
        wordId: item.wordId,
        source: item.source,
        ok,
        revealed,
        justMastered,
        waiting,
        mode: q.mode,
        insertedUid,
      };
      answersRef.current = [...answersRef.current, rec];
      setAnswers(answersRef.current);
      setAnswer({ ok, chosen, revealed, next, justMastered, waiting, insertedUid });
      if (q.mode === 'typing') void hideKeyboard();
      void haptic(ok ? 'ok' : 'bad');
    },
    [item, q, answer, progress, settings, bundle, rng, pos],
  );

  const advance = useCallback(() => {
    commit();
    setPos((v) => v + 1);
    setQ(null);
    setAnswer(null);
    setTyped('');
  }, [commit]);

  const undo = useCallback(() => {
    const last = answersRef.current[answersRef.current.length - 1];
    if (!last) return;
    pending.current = null;
    answersRef.current = answersRef.current.slice(0, -1);
    setAnswers(answersRef.current);
    if (last.insertedUid != null) {
      setQueue((old) => old.filter((x) => x.uid !== last.insertedUid));
    }
    setAnswer(null);
    void haptic('tap');
    if (last.mode === 'typing') window.setTimeout(() => inputRef.current?.focus(), 30);
  }, []);

  const onChoose = (i: number) => {
    if (!q) return;
    submit(i === 0 && q.kind === 'self' ? true : checkChoice(i, q), i);
  };

  const onTypeSubmit = () => {
    if (!q || !typed.trim() || answer) return;
    submit(checkTyping(typed, q), typed.trim());
  };

  const reveal = useCallback(() => {
    if (!q || answer || q.kind === 'self') return;
    submit(false, -1, true);
  }, [q, answer, submit]);

  const startQuiz = useCallback(() => {
    if (!item) return;
    setPreviewDone((prev) => new Set(prev).add(item.uid));
    // 预习后把这题至少后移 4 项，先看几个别的词再回来作答，避免瞬时记忆
    if (queue.length > 1) setQueue((old) => deferItem(old, pos, 4));
    setQ(null);
    setAnswer(null);
    setTyped('');
    void haptic('tap');
  }, [item, queue.length, pos]);

  const skipWord = useCallback(() => {
    if (!item || !word) return;
    const rec = newProgress(word.id, word.level, settings);
    rec.state = 'ignored';
    updateProgress([rec]);
    skippedRef.current = [...skippedRef.current, word.id];
    setSkipped(skippedRef.current);
    onToast?.(`「${word.word}」已标为已会，可在词库中恢复`);
    void haptic('tap');
    setPos((v) => v + 1);
    setQ(null);
    setAnswer(null);
    setTyped('');
  }, [item, word, settings, updateProgress, onToast]);

  const speakText = q
    ? q.speak ??
      (q.mode === 'jp2zh' || q.mode === 'jp2reading' ? (word?.reading ?? '') : undefined)
    : undefined;
  const replay = useCallback(() => {
    if (speakText) speak(speakText);
  }, [speakText, speak]);

  /* ------------------------------------------------ 键盘 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (previewing) {
        if (e.key === 'Enter') {
          e.preventDefault();
          startQuiz();
        }
        return;
      }
      if (!q) return;
      if (answer) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          advance();
        } else if (e.key.toLowerCase() === 'u' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) {
          e.preventDefault();
          undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
        return;
      }
      if (q.kind === 'choice' || q.kind === 'self') {
        const n = parseInt(e.key, 10);
        if (Number.isFinite(n) && n >= 1 && n <= q.options.length) {
          onChoose(n - 1);
          return;
        }
      }
      if (e.key.toLowerCase() === 'r' && speakText) {
        e.preventDefault();
        replay();
      }
      if (e.key.toLowerCase() === 'h' && q.kind !== 'self') {
        e.preventDefault();
        reveal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewing, q, answer, advance, undo, startQuiz, reveal, speakText, replay]);

  /* ------------------------------------------------ 结算 */
  if (!item || showSummary) {
    return (
      <SummaryView
        answers={answers}
        skipped={skipped}
        bundle={bundle}
        seconds={seconds}
        onExit={onExit}
        onStats={onStats}
        speak={speak}
      />
    );
  }

  if (!word) {
    return <div className="center-empty">词条数据缺失，正在跳过…</div>;
  }

  const total = queue.length;
  const doneNow = Math.min(pos, total);
  const shown = answer?.next ?? p;
  const streak = shown?.streak ?? 0;
  const target = Math.max(1, settings.masteryStreak);
  const waiting = shown ? needsNextDayCheck(shown, settings) : false;
  const previewReading = [
    settings.showFurigana && word.reading !== word.word ? word.reading : '',
    settings.showRomaji ? word.romaji : '',
  ]
    .filter(Boolean)
    .join(' · ');

  if (previewing) {
    return (
      <div>
        <div className="study-head">
          <button className="btn sm ghost" onClick={exitAndSave} type="button" aria-label="退出学习">
            <IconClose size={16} />
          </button>
          <div className="bar">
            <i style={{ width: `${total ? (doneNow / total) * 100 : 0}%` }} />
          </div>
          <div className="tiny mono">剩 {total - doneNow}</div>
        </div>

        <div className="card preview-card">
          <div className="row between">
            <span className="tag red">新词预习</span>
            <span className="tag">{word.level}</span>
          </div>
          <div className="pv-lead">先记住它 · 隔几个词再回来测验</div>
          <div className="pv-word">{word.word}</div>
          {previewReading && <div className="pv-reading">{previewReading}</div>}
          <button className="speak" onClick={() => speak(word.reading)} type="button">
            <IconVolume size={15} /> 听发音
          </button>

          <PosTags pos={word.pos} />
          <GlossList items={word.zh} />

          {word.example && (
            <div className="pv-example">
              <div style={{ fontSize: 15, lineHeight: 1.9 }}>
                <Ruby pieces={word.example.ruby} text={word.example.ja} mark={word.word} />
              </div>
              <div className="tiny" style={{ marginTop: 2 }}>
                {word.example.en}
              </div>
            </div>
          )}

          <div className="pv-actions">
            <button className="btn primary block" onClick={startQuiz} type="button">
              {queue.length > 1 ? '记住了，先看后面的词' : '记住了，开始测验'}
            </button>
            <button className="btn ghost block" onClick={skipWord} type="button">
              这个已会，跳过
            </button>
          </div>
          <div className="tiny" style={{ marginTop: 10, textAlign: 'center' }}>
            预习不会计入作答 · 连续 {target} 次答对且跨天，才算熟练
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="study-head">
        <button className="btn sm ghost" onClick={exitAndSave} type="button" aria-label="退出学习">
          <IconClose size={16} />
        </button>
        <div className="bar">
          <i style={{ width: `${total ? (doneNow / total) * 100 : 0}%` }} />
        </div>
        <div className="tiny mono">剩 {total - doneNow}</div>
      </div>

      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="row wrap">
          <span className={`tag ${item.source === 'new' ? 'red' : item.source === 'review' ? 'blue' : 'warn'}`}>
            {item.source === 'new' ? '新学' : item.source === 'review' ? '复习' : '巩固'}
          </span>
          <span className="tag">{word.level}</span>
          {shown && shown.state === 'learning' && (
            waiting ? (
              <span className="tag green">三连对完成 · 待明日验证</span>
            ) : (
              <span className="streak-dots" title={`连续正确 ${Math.min(streak, target)}/${target}`}>
                {Array.from({ length: target }).map((_, i) => (
                  <i key={i} className={i < Math.min(streak, target) ? 'on' : ''} />
                ))}
                <span className="tiny mono">
                  {Math.min(streak, target)}/{target}
                </span>
              </span>
            )
          )}
          {shown?.state === 'mastered' && (
            <span className="tag blue">
              复习 · 第 {shown.stage + 1} 阶
            </span>
          )}
        </div>
        <span className="tiny mono">
          ✓{correctCount} ✗{wrongCount}
        </span>
      </div>

      <div className="qcard">
        {q?.mode === 'cloze' && q.cloze ? (
          <div className="qprompt" style={{ lineHeight: 2 }}>
            <Ruby pieces={q.cloze.rubyBefore} text={q.cloze.before} />
            <span className="cloze-blank">　　　　</span>
            <Ruby pieces={q.cloze.rubyAfter} text={q.cloze.after} />
          </div>
        ) : q?.mode.startsWith('audio') ? (
          <div className="audio-stage">
            <button className="audio-orb" onClick={replay} type="button" aria-label="再听一次">
              <IconVolume size={26} />
            </button>
            <div className="qprompt" style={{ marginTop: 14 }}>
              {q.prompt}
            </div>
            {q.promptSub && <div className="qsub">{q.promptSub}</div>}
            <div className="tiny kbd-only" style={{ marginTop: 6 }}>
              按 R 重听
            </div>
          </div>
        ) : (
          <div
            className={`qword${
              q?.mode === 'zh2jp' || (q?.mode === 'typing' && q.prompt !== word.word) ? ' qzh' : ''
            }`}
          >
            {q?.prompt ?? word.word}
          </div>
        )}
        {q?.mode !== 'cloze' && !q?.mode.startsWith('audio') && q?.promptSub && (
          <div className="qsub">{q.promptSub}</div>
        )}
        {speakText && !q?.mode.startsWith('audio') && (
          <button className="speak" style={{ marginTop: 12 }} onClick={replay} type="button">
            <IconVolume size={15} /> 再听一次
          </button>
        )}
      </div>

      {q?.kind === 'choice' && (
        <div className="options">
          {q.options.map((o, i) => {
            const cls =
              answer === null
                ? ''
                : i === q.answerIndex
                  ? ' correct'
                  : i === answer.chosen
                    ? ' wrong'
                    : ' dim';
            return (
              <button className={`opt${cls}`} key={i} onClick={() => onChoose(i)} disabled={!!answer} type="button">
                <span className="idx">{String.fromCharCode(65 + i)}</span>
                <span style={{ fontSize: q.mode === 'jp2zh' || q.mode === 'audio2zh' ? 16 : 19 }}>{o}</span>
              </button>
            );
          })}
        </div>
      )}

      {q?.kind === 'typing' && (
        <div>
          <input
            ref={inputRef}
            className="typing-input"
            type="text"
            value={typed}
            placeholder="输入假名或罗马字"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onTypeSubmit();
              }
            }}
            disabled={!!answer}
            autoFocus
          />
          <div className="row between" style={{ marginTop: 8 }}>
            <span className="tiny">
              提示：{word.reading.slice(0, 1)}…（{word.reading.length} 个假名）
            </span>
            <button className="btn primary sm" onClick={onTypeSubmit} disabled={!!answer || !typed.trim()} type="button">
              提交
            </button>
          </div>
        </div>
      )}

      {q?.kind === 'self' && (
        <div className="options">
          {q.options.map((o, i) => (
            <button
              className={`opt${answer ? (i === 0 ? ' correct' : '') : ''}`}
              key={o}
              onClick={() => onChoose(i)}
              disabled={!!answer}
              type="button"
            >
              <span className="idx">{i + 1}</span>
              <span>{o}</span>
            </button>
          ))}
        </div>
      )}

      {q && !answer && q.kind !== 'self' && (
        <div className="row between" style={{ marginTop: 10 }}>
          <button className="linkbtn" onClick={reveal} type="button">
            <IconEye size={15} /> 不会，看答案
          </button>
          <span className="tiny kbd-only">按 H</span>
        </div>
      )}

      {answer && q && (
        <>
          <div className={`feedback ${answer.ok ? 'ok' : 'bad'}`}>
            <b>
              {answer.ok ? (
                <>
                  <IconCheck size={15} /> 正确
                </>
              ) : (
                <>
                  <IconCross size={15} /> {answer.revealed ? '已看答案' : '再记一次'}
                </>
              )}
            </b>
            {!answer.ok && <span className="muted"> 　正确答案：{q.answerText}</span>}
            <div className="tiny" style={{ marginTop: 4 }}>
              {feedbackLine(answer, settings)}
            </div>
          </div>

          <div className="card" style={{ marginTop: 12 }}>
            <WordDetail
              word={word}
              showRomaji={settings.showRomaji}
              onSpeak={speak}
              note={progress.get(word.id)?.note}
            />
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ghost" onClick={undo} type="button" title="撤销这次作答（U）">
              <IconUndo size={15} /> 撤销
            </button>
            <button className="btn primary" style={{ flex: 1 }} onClick={advance} type="button" autoFocus>
              下一个
            </button>
          </div>
          <div className="tiny kbd-only" style={{ textAlign: 'center', marginTop: 8 }}>
            Enter 继续 · U 撤销 · 1-6 选择答案
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ 辅助 */

function retryMode(
  word: Word,
  current: QuizMode,
  state: WordState,
  settings: Settings,
  rng: () => number,
): QuizMode {
  const used: Partial<Record<QuizMode, number>> = { [current]: 1 };
  const picked = chooseMode(word, settings.modes, used, rng, state);
  if (picked && picked !== current) return picked;
  const alt = settings.modes.filter((m) => m !== current && modeAvailable(word, m));
  return alt.length ? alt[Math.floor(rng() * alt.length)] : current;
}

/** 插入重练题时留出 3~5 题的间隔，并避免与同一个词紧挨着出现 */
function insertWithGap(list: QueueItem[], from: number, item: QueueItem): QueueItem[] {
  const copy = list.slice();
  let at = Math.min(copy.length, from + 3 + (item.uid % 3));
  while (at < copy.length && copy[at]?.wordId === item.wordId) at++;
  while (at > from + 1 && copy[at - 1]?.wordId === item.wordId) at--;
  copy.splice(at, 0, item);
  return copy;
}

function buildSummary(answers: AnswerRecord[], seconds: number): StudySummary {
  const newIds = new Set<string>();
  const reviewIds = new Set<string>();
  let correct = 0;
  let mastered = 0;
  for (const a of answers) {
    if (a.ok) correct++;
    if (a.justMastered) mastered++;
    if (a.source === 'new') newIds.add(a.wordId);
    else reviewIds.add(a.wordId);
  }
  return {
    done: answers.length,
    correct,
    newDone: newIds.size,
    reviewDone: reviewIds.size,
    mastered,
    seconds,
  };
}

function feedbackLine(a: AnswerState, settings: Settings): string {
  if (!a.ok) {
    if (a.revealed) {
      return a.insertedUid != null
        ? '已按未掌握处理，稍后换一种题型再练一次'
        : `已按未掌握处理，约 ${settings.relearnDelayMinutes} 分钟后可再练`;
    }
    if (a.insertedUid != null) {
      return a.next.state === 'mastered' ? '复习未通过，稍后换个题型再确认一次' : '别急，稍后换一种题型再练一次';
    }
    return `本轮重练已达上限，约 ${settings.relearnDelayMinutes} 分钟后可再练`;
  }
  if (a.justMastered) return `已熟练 · ${a.next.interval} 天后安排复习`;
  if (a.waiting) return '三连对完成 · 明天完成跨天验证后进入复习';
  if (a.next.state === 'mastered') return `复习通过 · 下次约 ${a.next.interval} 天后`;
  if (a.insertedUid != null) return `连续正确 ${a.next.streak}/${settings.masteryStreak} · 稍后换题型再巩固一次`;
  return `连续正确 ${a.next.streak}/${settings.masteryStreak}`;
}

/* ------------------------------------------------------------------ 结算页 */

function SummaryView({
  answers,
  skipped,
  bundle,
  seconds,
  onExit,
  onStats,
  speak,
}: {
  answers: AnswerRecord[];
  skipped: string[];
  bundle: LevelBundle;
  seconds: number;
  onExit: () => void;
  onStats?: () => void;
  speak: (t: string) => void;
}) {
  const newIds = uniq(answers.filter((a) => a.source === 'new').map((a) => a.wordId));
  const reviewIds = uniq(answers.filter((a) => a.source !== 'new').map((a) => a.wordId));
  const wrongIds = uniq(answers.filter((a) => !a.ok).map((a) => a.wordId));
  const waitingIds = uniq(answers.filter((a) => a.waiting).map((a) => a.wordId));
  const skippedIds = uniq(skipped);
  const correct = answers.filter((a) => a.ok).length;
  const mastered = answers.filter((a) => a.justMastered).length;
  const rate = answers.length ? Math.round((correct / answers.length) * 100) : 0;
  const minutes = Math.max(1, Math.round(seconds / 60));

  const rows = (ids: string[]) =>
    ids
      .map((id) => bundle.index.get(id))
      .filter((w): w is Word => !!w)
      .map((w) => (
        <div className="sum-row" key={w.id}>
          <div className="sum-word">
            <b>{w.word}</b>
            {w.reading !== w.word && <span className="muted">{w.reading}</span>}
          </div>
          <div className="sum-meaning">
            <b>{w.zh[0]}</b>
            {w.zh[1] ? `；${w.zh[1]}` : ''}
          </div>
          <button className="iconbtn" onClick={() => speak(w.reading)} type="button" aria-label={`朗读 ${w.word}`}>
            <IconVolume size={15} />
          </button>
        </div>
      ));

  return (
    <div className="summary">
      <div className="card sum-hero">
        <div className="sum-done">
          <IconDone size={40} />
        </div>
        <div className="sum-title">本轮完成</div>
        {answers.length ? (
          <>
            <div className="sum-rate mono">
              {rate}
              <span>%</span>
            </div>
            <div className="tiny">正确率 · 共作答 {answers.length} 题</div>
            <div className="sum-grid">
              <div className="stat">
                <div className="v">{newIds.length}</div>
                <div className="k">新学词</div>
              </div>
              <div className="stat">
                <div className="v">{reviewIds.length}</div>
                <div className="k">复习/巩固</div>
              </div>
              <div className="stat">
                <div className="v">{mastered}</div>
                <div className="k">新熟练</div>
              </div>
              <div className="stat">
                <div className="v">{minutes}</div>
                <div className="k">用时（分）</div>
              </div>
            </div>
          </>
        ) : (
          <div className="tiny" style={{ marginTop: 6 }}>
            本轮没有作答记录，已会跳过 {skippedIds.length} 个词。
          </div>
        )}
        {waitingIds.length > 0 && (
          <div className="sum-note">
            有 {waitingIds.length} 个词已完成三连对，明天再来验证一次即可进入复习。
          </div>
        )}
      </div>

      {newIds.length > 0 && (
        <div className="card">
          <div className="row between" style={{ marginBottom: 6 }}>
            <b>本轮新词</b>
            <span className="tiny">{newIds.length} 个</span>
          </div>
          <div className="sum-list">{rows(newIds)}</div>
        </div>
      )}

      {wrongIds.length > 0 && (
        <div className="card">
          <div className="row between" style={{ marginBottom: 6 }}>
            <b>需要再看一遍</b>
            <span className="tiny">{wrongIds.length} 个</span>
          </div>
          <div className="sum-list">{rows(wrongIds)}</div>
          <div className="tiny" style={{ marginTop: 6 }}>
            这些词已自动加回近期队列，也可以在词库中筛选「易错词」集中攻克。
          </div>
        </div>
      )}

      {skippedIds.length > 0 && (
        <div className="card">
          <div className="row between" style={{ marginBottom: 6 }}>
            <b>已会跳过</b>
            <span className="tiny">{skippedIds.length} 个</span>
          </div>
          <div className="sum-list">{rows(skippedIds)}</div>
          <div className="tiny" style={{ marginTop: 6 }}>
            跳过的词不再出现；如果判断有误，可在词库中把它恢复为未学。
          </div>
        </div>
      )}

      <div className="sum-actions">
        <button className="btn primary block" onClick={onExit} type="button">
          返回首页
        </button>
        {onStats && (
          <button className="btn block" onClick={onStats} type="button">
            查看统计
          </button>
        )}
      </div>
      <div className="tiny" style={{ textAlign: 'center', marginTop: 10 }}>
        本轮记录已自动保存
      </div>
    </div>
  );
}

function uniq(ids: string[]): string[] {
  return Array.from(new Set(ids));
}
