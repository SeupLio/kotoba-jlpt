import { useCallback, useEffect, useRef, useState } from 'react';
import type { Level } from '../core/types';
import {
  formatClock,
  listeningScriptLines,
  questionKindLabel,
  type ExamPaper,
  type ExamQuestion,
} from '../core/exam';
import { useSpeech } from '../hooks/useSpeech';
import { haptic, hideKeyboard } from '../platform/native';
import { Modal } from '../components/ui';
import { IconClose, IconUndo, IconVolume } from '../components/icons';

interface Props {
  paper: ExamPaper;
  onFinish: (answers: Record<string, number | null>, timing: { startedAt: number; finishedAt: number }) => void;
  onQuit: () => void;
  onToast: (msg: string) => void;
}

const RATE: Record<Level, number> = { N5: 0.82, N4: 0.88, N3: 0.94, N2: 1.0, N1: 1.06 };

type Phase = 'answering' | 'between';

export function ExamRunner({ paper, onFinish, onQuit, onToast }: Props) {
  const { speak, stop, status: speechStatus } = useSpeech(RATE[paper.level]);

  const [sectionIdx, setSectionIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [phase, setPhase] = useState<Phase>('answering');
  const [deadline, setDeadline] = useState(() => Date.now() + paper.sections[0].minutes * 60_000);
  const [now, setNow] = useState(() => Date.now());
  const [cardOpen, setCardOpen] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [played, setPlayed] = useState<Set<string>>(new Set());
  const [passageOpen, setPassageOpen] = useState(true);

  const startedAtRef = useRef(Date.now());
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const playedRef = useRef<Set<string>>(new Set());
  const submittingRef = useRef(false);

  const section = paper.sections[sectionIdx];
  const question = section?.questions[qIdx];
  const answeredInSection = section ? section.questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== null).length : 0;
  const remaining = Math.max(0, Math.ceil((deadline - now) / 1000));
  const isListening = section?.key === 'listening';
  const silent = speechStatus === 'unavailable';

  /* ------------------------------------------------ 计时 */
  useEffect(() => {
    if (phase !== 'answering') return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [phase]);

  const submitSection = useCallback(
    (auto = false) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setConfirmSubmit(false);
      setCardOpen(false);
      stop();
      if (sectionIdx + 1 >= paper.sections.length) {
        onFinish(answersRef.current, { startedAt: startedAtRef.current, finishedAt: Date.now() });
        return;
      }
      if (auto) onToast('本部分时间到，已自动提交');
      setPhase('between');
    },
    [sectionIdx, paper.sections.length, onFinish, onToast, stop],
  );

  const submitRef = useRef(submitSection);
  submitRef.current = submitSection;

  useEffect(() => {
    if (phase !== 'answering') return;
    if (remaining > 0) return;
    submitRef.current(true);
  }, [remaining, phase]);

  /* ------------------------------------------------ 听力：每题只播一次 */
  useEffect(() => {
    if (phase !== 'answering' || !isListening || !question || question.kind !== 'listening') return;
    if (silent || speechStatus === 'probing') return;
    if (playedRef.current.has(question.id)) return;
    const id = window.setTimeout(() => {
      if (playedRef.current.has(question.id)) return;
      playedRef.current.add(question.id);
      setPlayed(new Set(playedRef.current));
      void speak(question.speakText);
    }, 450);
    return () => {
      window.clearTimeout(id);
      stop();
    };
    // speak / stop 由 hook 提供稳定引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isListening, question?.id, silent, speechStatus]);

  useEffect(() => () => stop(), [stop]);

  useEffect(() => {
    setPassageOpen(true);
    setCardOpen(false);
  }, [qIdx, sectionIdx]);

  const choose = useCallback(
    (i: number) => {
      if (!question) return;
      setAnswers((prev) => ({ ...prev, [question.id]: i }));
      void haptic('tap');
      void hideKeyboard();
    },
    [question],
  );

  const goNext = useCallback(() => {
    if (!section) return;
    if (qIdx + 1 >= section.questions.length) {
      setConfirmSubmit(true);
      return;
    }
    setQIdx(qIdx + 1);
  }, [section, qIdx]);

  const enterNextSection = useCallback(() => {
    const next = sectionIdx + 1;
    if (!paper.sections[next]) return;
    submittingRef.current = false;
    setSectionIdx(next);
    setQIdx(0);
    setPhase('answering');
    setNow(Date.now());
    setDeadline(Date.now() + paper.sections[next].minutes * 60_000);
  }, [sectionIdx, paper.sections]);

  /* Android 返回键：由 App 转发事件，考试中先确认再退出 */
  useEffect(() => {
    const onBack = () => {
      if (phase === 'answering') setConfirmQuit(true);
      else onQuit();
    };
    window.addEventListener('kotoba:exam-back', onBack);
    return () => window.removeEventListener('kotoba:exam-back', onBack);
  }, [phase, onQuit]);

  const unanswered = section ? section.questions.length - answeredInSection : 0;

  /* ------------------------------------------------ 部分间过渡 */
  if (phase === 'between') {
    const next = paper.sections[sectionIdx + 1];
    return (
      <div className="exam-runner">
        <div className="exam-between">
          <div className="exam-between-mark">区切り</div>
          <h2>{section.label} 已完成</h2>
          <div className="tiny">
            本部分作答 {answeredInSection} / {section.questions.length} 题，提交后不可返回修改。
          </div>
          <div className="exam-next-card">
            <div className="tiny">下一部分</div>
            <b>{next.label}</b>
            <div className="tiny">
              题量 {next.questions.length} 题 · 限时 {next.minutes} 分钟
            </div>
            {next.key === 'listening' && (
              <div className="exam-note warn">
                听力只播放一次。播放前请确认音量，进入后不能暂停或重听。
              </div>
            )}
          </div>
          <button className="btn primary block" onClick={enterNextSection} type="button">
            进入下一部分
          </button>
        </div>
      </div>
    );
  }

  if (!section || !question) return null;

  const selected = answers[question.id];
  const lastQuestion = qIdx + 1 >= section.questions.length;

  return (
    <div className="exam-runner">
      <header className="exam-topbar">
        <button className="iconbtn" onClick={() => setConfirmQuit(true)} type="button" aria-label="退出考试">
          <IconClose size={20} />
        </button>
        <div className="exam-topmeta">
          <span className="exam-level mono">{paper.level}</span>
          <span className="exam-section-label">{section.short}</span>
          <span className="tiny">
            {sectionIdx + 1}/{paper.sections.length}
          </span>
        </div>
        <div className={`exam-clock mono${remaining <= 60 ? ' urgent' : ''}`}>{formatClock(remaining)}</div>
      </header>

      <div className="exam-progress-strip">
        <div className="bar blue">
          <i style={{ width: `${(answeredInSection / Math.max(1, section.questions.length)) * 100}%` }} />
        </div>
        <span className="tiny mono">
          {answeredInSection}/{section.questions.length}
        </span>
      </div>

      <main className="exam-question-area">
        <div className="exam-question-head">
          <span className="exam-qno mono">Q{qIdx + 1}</span>
          <span className="tag">{questionKindLabel(question)}</span>
          <button className="btn sm ghost" style={{ marginLeft: 'auto' }} onClick={() => setCardOpen(true)} type="button">
            答题卡
          </button>
        </div>

        {question.kind === 'reading' && (
          <div className="exam-passage">
            <button className="exam-passage-head" aria-expanded={passageOpen} onClick={() => setPassageOpen((v) => !v)} type="button">
              <span>
                {question.passageTitle}
                <span className="tiny"> · {questionKindLabel(question)}</span>
              </span>
              <span className="tiny">{passageOpen ? '收起' : '展开'}</span>
            </button>
            {passageOpen && <div className="exam-passage-text">{question.passage}</div>}
          </div>
        )}

        {question.kind === 'listening' && (
          <div className="exam-listen-card">
            <div className="row between">
              <span className="tag red">{question.listeningType === 'point' ? '课题理解' : '即时应答'}</span>
              <span className="tiny">
                {silent
                  ? '设备无日语语音，已切换文字模式'
                  : played.has(question.id)
                    ? '本段已播放 · 不可重听'
                    : speechStatus === 'probing'
                      ? '正在准备语音…'
                      : '即将播放（仅一次）'}
              </span>
            </div>
            {silent ? (
              <div className="exam-listen-script">
                {listeningScriptLines(question.script).map((l, i) => (
                  <div key={i}>
                    {l.speaker && <b>{l.speaker}：</b>}
                    {l.text}
                  </div>
                ))}
              </div>
            ) : (
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button
                  className="btn sm"
                  onClick={() => void speak(question.speakText)}
                  disabled={played.has(question.id) || speechStatus === 'probing'}
                  type="button"
                >
                  <IconVolume size={15} />
                  {played.has(question.id) ? '已播放' : '播放录音'}
                </button>
                <span className="tiny">真实考场中，听力音频只播放一次</span>
              </div>
            )}
          </div>
        )}

        <div className={`exam-question-text${question.kind === 'vocab' ? ' exam-word' : ''}`}>{question.prompt}</div>
        {question.promptSub && <div className="qsub">{question.promptSub}</div>}

        <div className="options exam-options">
          {question.options.map((o, i) => (
            <button
              className={`opt${selected === i ? ' selected' : ''}`}
              key={i}
              onClick={() => choose(i)}
              type="button"
            >
              <span className="idx">{String.fromCharCode(65 + i)}</span>
              <span style={{ fontSize: question.kind === 'vocab' ? 17 : 16 }}>{o}</span>
            </button>
          ))}
        </div>

        <div className="exam-nav">
          <button
            className="btn"
            onClick={() => setQIdx(Math.max(0, qIdx - 1))}
            disabled={qIdx === 0}
            type="button"
          >
            <IconUndo size={16} /> 上一题
          </button>
          <button className={`btn ${lastQuestion ? 'primary' : ''}`} onClick={goNext} type="button">
            {lastQuestion ? '提交本部分' : '下一题'}
          </button>
        </div>
      </main>

      <Modal open={cardOpen} onClose={() => setCardOpen(false)}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <b>答题卡 · {section.short}</b>
          <button className="iconbtn" onClick={() => setCardOpen(false)} type="button" aria-label="关闭">
            <IconClose size={20} />
          </button>
        </div>
        <div className="exam-card-grid">
          {section.questions.map((q, i) => {
            const done = answers[q.id] !== undefined && answers[q.id] !== null;
            return (
              <button
                key={q.id}
                className={`exam-card-cell${done ? ' done' : ''}${i === qIdx ? ' current' : ''}`}
                onClick={() => {
                  setQIdx(i);
                  setCardOpen(false);
                }}
                type="button"
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="tiny" style={{ marginTop: 10 }}>
          已作答 {answeredInSection} / {section.questions.length}。提交本部分后不可返回。
        </div>
      </Modal>

      <Modal open={confirmSubmit} onClose={() => setConfirmSubmit(false)}>
        <b>{sectionIdx + 1 === paper.sections.length ? '确认交卷？' : '确认提交本部分？'}</b>
        <div className="tiny" style={{ marginTop: 6 }}>
          {unanswered > 0 ? `还有 ${unanswered} 题未作答。` : '本部分已全部作答。'}
          提交后不能返回修改。
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={() => setConfirmSubmit(false)} type="button">
            继续作答
          </button>
          <button className="btn primary" onClick={() => submitSection(false)} type="button">
            {sectionIdx + 1 === paper.sections.length ? '交卷' : '提交并继续'}
          </button>
        </div>
      </Modal>

      <Modal open={confirmQuit} onClose={() => setConfirmQuit(false)}>
        <b>退出本次模考？</b>
        <div className="tiny" style={{ marginTop: 6 }}>
          考试中途退出不会保存成绩，也不会暂停计时。真实考场中也不能中途离场。
        </div>
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn" onClick={() => setConfirmQuit(false)} type="button">
            继续考试
          </button>
          <button className="btn primary" onClick={onQuit} type="button">
            退出
          </button>
        </div>
      </Modal>
    </div>
  );
}
