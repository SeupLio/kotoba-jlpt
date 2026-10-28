import { useMemo, useState } from 'react';
import {
  listeningScriptLines,
  questionKindLabel,
  type ExamPaper,
  type ExamQuestion,
  type ExamResult,
} from '../core/exam';
import { IconVolume } from '../components/icons';

interface Props {
  paper: ExamPaper;
  result: ExamResult;
  onRetry: () => void;
  onBack: () => void;
  speak: (text: string) => void;
}

type Filter = 'wrong' | 'all';

export function ExamResultView({ paper, result, onRetry, onBack, speak }: Props) {
  const [filter, setFilter] = useState<Filter>('wrong');

  const wrongCount = useMemo(
    () =>
      paper.sections.reduce(
        (n, s) => n + s.questions.filter((q) => result.answers[q.id] !== q.answerIndex).length,
        0,
      ),
    [paper, result.answers],
  );

  const minutes = Math.floor(result.spentSec / 60);
  const seconds = result.spentSec % 60;

  return (
    <div className="exam-result">
      <div className="section-head">
        <div>
          <div className="section-kicker">模考结果 · {paper.level}</div>
          <h1 className="section-title-lg">{result.passed ? '合格' : '未合格'}</h1>
          <div className="tiny" style={{ marginTop: 4 }}>
            {new Date(result.finishedAt).toLocaleString('zh-CN')} · 用时 {minutes} 分 {seconds} 秒 · 未作答{' '}
            {result.unanswered} 题
          </div>
        </div>
        <div className={`exam-stamp${result.passed ? ' pass' : ' fail'}`} aria-hidden="true">
          {result.passed ? '合格' : '再試' }
        </div>
      </div>

      <div className={`card exam-score-card${result.passed ? ' pass' : ''}`}>
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="tiny">总分</div>
            <div className="exam-total-score mono">
              {result.totalScore}
              <span> / {result.totalMax}</span>
            </div>
            <div className="tiny">
              合格线 {result.passScore} 分 · 单科最低 {paper.level === 'N4' || paper.level === 'N5' ? '38 / 19' : '19'}{' '}
              分
            </div>
          </div>
          <div className={`exam-verdict${result.passed ? ' pass' : ' fail'}`}>
            {result.passed ? '达到合格线' : result.sectionFailed ? '单科未达标' : '总分未达标'}
          </div>
        </div>

        <div className="exam-section-scores">
          {result.sections.map((s) => (
            <div className="exam-section-score" key={s.key}>
              <div className="row between tiny">
                <span>{s.label}</span>
                <span className={`mono${s.passed ? '' : ' exam-fail-text'}`}>
                  {s.score}/{s.max}
                </span>
              </div>
              <div className={`bar${s.passed ? ' green' : ''}`} style={{ marginTop: 5 }}>
                <i
                  style={{
                    width: `${(s.score / Math.max(1, s.max)) * 100}%`,
                    background: s.passed ? undefined : 'var(--accent)',
                  }}
                />
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                答对 {s.correct}/{s.total} · 单科线 {s.min}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="exam-disclaimer">
        本卷为原创模拟题，按 JLPT 公开的科目结构、时长比例与合格线设计，不包含官方真题；分数仅用于自测参考。
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        <button className={`chip${filter === 'wrong' ? ' active' : ''}`} onClick={() => setFilter('wrong')} type="button">
          只看错题（{wrongCount}）
        </button>
        <button className={`chip${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')} type="button">
          全部题目（{paper.totalQuestions}）
        </button>
      </div>

      {paper.sections.map((section, si) => {
        const sq = section.questions
          .map((q, i) => ({ q, i }))
          .filter(({ q }) => filter === 'all' || result.answers[q.id] !== q.answerIndex);
        if (!sq.length) return null;
        const sr = result.sections[si];
        return (
          <section key={section.key} className="exam-review-section">
            <div className="section-title">
              {section.label} · {sr.score}/{sr.max}
            </div>
            {sq.map(({ q, i }) => (
              <ReviewQuestion
                key={q.id}
                q={q}
                index={i}
                chosen={result.answers[q.id]}
                speak={speak}
              />
            ))}
          </section>
        );
      })}

      {filter === 'wrong' && wrongCount === 0 && (
        <div className="card center-empty" style={{ padding: 28 }}>
          全部答对，没有错题。
        </div>
      )}

      <div className="exam-result-actions">
        <button className="btn primary" onClick={onRetry} type="button">
          再考一次（换一套题）
        </button>
        <button className="btn" onClick={onBack} type="button">
          返回模考首页
        </button>
      </div>
    </div>
  );
}

function ReviewQuestion({
  q,
  index,
  chosen,
  speak,
}: {
  q: ExamQuestion;
  index: number;
  chosen: number | null | undefined;
  speak: (t: string) => void;
}) {
  const correct = chosen === q.answerIndex;
  return (
    <div className={`card exam-review-card${correct ? ' ok' : ' bad'}`}>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="mono tiny">Q{index + 1}</span>
          <span className="tag">{questionKindLabel(q)}</span>
        </div>
        <span className={`tag ${correct ? 'green' : 'red'}`}>{correct ? '答对' : chosen == null ? '未作答' : '答错'}</span>
      </div>

      {q.kind === 'reading' && (
        <details className="review-details">
          <summary>查看阅读原文 · {q.passageTitle}</summary>
          <div className="exam-passage-text">{q.passage}</div>
        </details>
      )}

      {q.kind === 'listening' && (
        <details className="review-details">
          <summary>查看听力原文</summary>
          <div className="exam-listen-script">
            {listeningScriptLines(q.script).map((l, i) => (
              <div key={i}>
                {l.speaker && <b>{l.speaker}：</b>}
                {l.text}
              </div>
            ))}
          </div>
          <button className="speak" style={{ marginTop: 8 }} onClick={() => speak(q.speakText)} type="button">
            <IconVolume size={15} /> 重听录音
          </button>
        </details>
      )}

      <div className="exam-review-q">{q.prompt}</div>
      {q.promptSub && <div className="qsub">{q.promptSub}</div>}

      <div className="options" style={{ marginTop: 10 }}>
        {q.options.map((o, i) => {
          const cls = i === q.answerIndex ? ' correct' : i === chosen ? ' wrong' : ' dim';
          return (
            <div className={`opt${cls}`} key={i}>
              <span className="idx">{String.fromCharCode(65 + i)}</span>
              <span style={{ fontSize: 15 }}>{o}</span>
              {i === q.answerIndex && <span className="review-badge">正确</span>}
              {i === chosen && i !== q.answerIndex && <span className="review-badge wrong">你的选择</span>}
            </div>
          );
        })}
      </div>

      <div className="feedback-explain" style={{ marginTop: 10 }}>
        {q.explain}
      </div>
    </div>
  );
}
