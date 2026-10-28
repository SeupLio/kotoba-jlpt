import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Level, Settings } from '../core/types';
import { LEVELS } from '../core/types';
import type { GrammarPoint } from '../core/content-types';
import {
  GRAMMAR_MASTERY_STREAK,
  GRAMMAR_MODE_LABEL,
  applyGrammarAnswer,
  checkGrammarAnswer,
  grammarStats,
  makeGrammarQuestions,
  type GrammarProgress,
  type GrammarQuestion,
} from '../core/grammar';
import { loadGrammar, searchGrammar } from '../data/content';
import { haptic } from '../platform/native';
import { Modal } from '../components/ui';
import { IconCheck, IconClose, IconVolume } from '../components/icons';

interface Props {
  settings: Settings;
  progress: Map<string, GrammarProgress>;
  updateProgress: (items: GrammarProgress[]) => void;
  speak: (text: string) => void;
  onToast: (msg: string) => void;
}

type Filter = 'all' | 'todo' | 'mastered';

interface Session {
  questions: GrammarQuestion[];
  idx: number;
  chosen: number | null;
  results: boolean[];
}

export function Grammar({ settings, progress, updateProgress, speak, onToast }: Props) {
  const [level, setLevel] = useState<Level>(settings.levels[0] ?? 'N5');
  const [points, setPoints] = useState<GrammarPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [detail, setDetail] = useState<GrammarPoint | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setPoints(null);
    setError(null);
    loadGrammar(level)
      .then((rows) => {
        if (!cancelled) setPoints(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(String((e as Error)?.message ?? e));
      });
    return () => {
      cancelled = true;
    };
  }, [level]);

  const stats = useMemo(
    () => (points ? grammarStats(points, progress) : { total: 0, seen: 0, mastered: 0, correct: 0, wrong: 0 }),
    [points, progress],
  );

  const list = useMemo(() => {
    if (!points) return [];
    const searched = searchGrammar(points, q);
    return searched.filter((p) => {
      if (filter === 'all') return true;
      const g = progress.get(p.id);
      return filter === 'mastered' ? !!g?.masteredAt : !g?.masteredAt;
    });
  }, [points, q, filter, progress]);

  const startPractice = useCallback(() => {
    if (!points?.length) return;
    const questions = makeGrammarQuestions(points, points, Math.min(10, points.length));
    setSession({ questions, idx: 0, chosen: null, results: [] });
    setFinished(false);
    setDetail(null);
  }, [points]);

  const current = session ? session.questions[session.idx] : null;

  const choose = useCallback(
    (choice: number) => {
      if (!session || !current || session.chosen !== null) return;
      const ok = checkGrammarAnswer(current, choice);
      const prev = progress.get(current.pointId);
      updateProgress([applyGrammarAnswer(prev, current, ok)]);
      setSession({ ...session, chosen: choice, results: [...session.results, ok] });
      void haptic(ok ? 'ok' : 'bad');
    },
    [session, current, progress, updateProgress],
  );

  const next = useCallback(() => {
    if (!session) return;
    if (session.idx + 1 >= session.questions.length) {
      setFinished(true);
      return;
    }
    setSession({ ...session, idx: session.idx + 1, chosen: null });
  }, [session]);

  const exitSession = useCallback(() => {
    setSession(null);
    setFinished(false);
  }, []);

  /* ------------------------------------------------ 练习视图 */
  if (session && current) {
    if (finished) {
      const correct = session.results.filter(Boolean).length;
      const total = session.results.length;
      const wrongQs = session.questions.filter((_, i) => session.results[i] === false);
      return (
        <div className="grammar-page">
          <div className="section-head">
            <div>
              <div className="section-kicker">语法练习 · {level}</div>
              <h1 className="section-title-lg">本次练习完成</h1>
            </div>
          </div>
          <div className="card grammar-summary">
            <div className="grammar-score mono">
              {correct}
              <span> / {total}</span>
            </div>
            <div className="tiny">正确率 {total ? Math.round((correct / total) * 100) : 0}%</div>
            <div className="bar green" style={{ marginTop: 12 }}>
              <i style={{ width: `${total ? (correct / total) * 100 : 0}%` }} />
            </div>
            <div className="tiny" style={{ marginTop: 10 }}>
              连续答对 {GRAMMAR_MASTERY_STREAK} 次即标记为已掌握；练习记录已保存。
            </div>
          </div>

          {wrongQs.length > 0 && (
            <div className="card">
              <div className="tiny" style={{ marginBottom: 8 }}>
                本次答错的语法点
              </div>
              {wrongQs.map((x) => (
                <button
                  key={x.pointId}
                  className="grammar-wrong-row"
                  type="button"
                  onClick={() => {
                    const p = points?.find((v) => v.id === x.pointId);
                    if (p) setDetail(p);
                  }}
                >
                  <span>{x.pattern}</span>
                  <span className="muted">{x.meaning}</span>
                </button>
              ))}
            </div>
          )}

          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn primary" onClick={startPractice} type="button">
              再练一组
            </button>
            <button className="btn" onClick={exitSession} type="button">
              返回语法列表
            </button>
          </div>
        </div>
      );
    }

    const revealed = session.chosen !== null;
    const ok = revealed && session.chosen === current.answerIndex;
    return (
      <div className="grammar-page">
        <div className="practice-top">
          <button className="btn sm ghost" onClick={exitSession} type="button">
            <IconClose size={16} /> 退出练习
          </button>
          <div className="practice-progress">
            <span className="mono">
              {session.idx + 1} / {session.questions.length}
            </span>
            <div className="bar" style={{ width: 120 }}>
              <i style={{ width: `${((session.idx + (revealed ? 1 : 0)) / session.questions.length) * 100}%` }} />
            </div>
          </div>
        </div>

        <div className="card practice-card">
          <div className="tiny" style={{ marginBottom: 8 }}>
            {GRAMMAR_MODE_LABEL[current.mode]} · {current.level}
          </div>
          <div className="grammar-prompt">{current.prompt}</div>
          {current.promptSub && <div className="qsub">{current.promptSub}</div>}

          <div className="options">
            {current.options.map((o, i) => {
              const cls = !revealed
                ? ''
                : i === current.answerIndex
                  ? ' correct'
                  : i === session.chosen
                    ? ' wrong'
                    : ' dim';
              return (
                <button className={`opt${cls}`} key={i} onClick={() => choose(i)} disabled={revealed} type="button">
                  <span className="idx">{String.fromCharCode(65 + i)}</span>
                  <span style={{ fontSize: current.mode === 'cloze' ? 18 : 16 }}>{o}</span>
                </button>
              );
            })}
          </div>

          {revealed && (
            <div className={`feedback ${ok ? 'ok' : 'bad'}`}>
              <div className="fb-head">
                {ok ? <IconCheck size={18} /> : <IconClose size={18} />}
                <b>{ok ? '答对了' : '再记一次'}</b>
              </div>
              <div className="feedback-explain">{current.explain}</div>
              <button className="speak" style={{ marginTop: 8 }} onClick={() => speak(current.example.ja)} type="button">
                <IconVolume size={15} /> 朗读例句
              </button>
            </div>
          )}

          {revealed && (
            <button className="btn primary block" style={{ marginTop: 12 }} onClick={next} type="button">
              {session.idx + 1 >= session.questions.length ? '查看结果' : '下一题'}
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------ 列表视图 */
  const masteredPct = stats.total ? (stats.mastered / stats.total) * 100 : 0;
  return (
    <div className="grammar-page">
      <div className="section-head">
        <div>
          <div className="section-kicker">文法 · 原创题库</div>
          <h1 className="section-title-lg">语法训练</h1>
          <div className="tiny" style={{ marginTop: 4 }}>
            覆盖 N1–N5 共 140 个语法点，三种题型轮换练习；不包含官方真题。
          </div>
        </div>
        <button className="btn primary" onClick={startPractice} disabled={!points?.length} type="button">
          开始练习
        </button>
      </div>

      <div className="card grammar-overview">
        <div className="row between" style={{ alignItems: 'flex-end' }}>
          <div>
            <div className="tiny">当前等级 · {level}</div>
            <div className="grammar-big mono">
              {stats.mastered}
              <span> / {stats.total}</span>
            </div>
            <div className="tiny">已掌握语法点</div>
          </div>
          <div className="grammar-overview-side">
            <div className="tiny">
              已练 {stats.seen} · 答对 {stats.correct} · 答错 {stats.wrong}
            </div>
            <div className="bar green" style={{ width: 150, marginTop: 6 }}>
              <i style={{ width: `${masteredPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`chip${level === lv ? ' active' : ''}`}
            onClick={() => {
              setLevel(lv);
              setQ('');
              setFilter('all');
            }}
            type="button"
          >
            {lv}
          </button>
        ))}
      </div>

      <div className="searchbar">
        <input
          value={q}
          placeholder="搜索：语法形式 / 中文释义 / 例句 / 标签"
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button className="btn sm" onClick={() => setQ('')} type="button">
            清空
          </button>
        )}
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
        {(
          [
            ['all', '全部'],
            ['todo', '未掌握'],
            ['mastered', '已掌握'],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`chip${filter === key ? ' active' : ''}`}
            onClick={() => setFilter(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <b>语法题库加载失败：</b> {error}
          <div className="tiny">请确认已执行 npm run sync:data。</div>
        </div>
      )}

      {!points && !error && <div className="center-empty">正在载入语法题库…</div>}

      {points && (
        <div className="grammar-list">
          {list.map((p) => {
            const g = progress.get(p.id);
            const mastered = !!g?.masteredAt;
            return (
              <button
                key={p.id}
                className={`grammar-row${mastered ? ' mastered' : ''}`}
                onClick={() => setDetail(p)}
                type="button"
              >
                <div className="grammar-row-main">
                  <div className="grammar-pattern">{p.pattern}</div>
                  <div className="grammar-meaning">{p.meaning}</div>
                  <div className="row wrap" style={{ gap: 4, marginTop: 5 }}>
                    {p.tags.slice(0, 3).map((t) => (
                      <span className="tag" key={t}>
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grammar-row-side">
                  {mastered ? (
                    <span className="tag green">已掌握</span>
                  ) : g?.seen ? (
                    <span className="tag warn mono">
                      {g.streak}/{GRAMMAR_MASTERY_STREAK}
                    </span>
                  ) : (
                    <span className="tag">未练</span>
                  )}
                </div>
              </button>
            );
          })}
          {!list.length && <div className="center-empty">没有匹配的语法点</div>}
        </div>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)}>
        {detail && (
          <div>
            <div className="row between" style={{ alignItems: 'flex-start' }}>
              <div>
                <div className="grammar-detail-pattern">{detail.pattern}</div>
                <div className="muted">{detail.meaning}</div>
              </div>
              <button className="iconbtn" onClick={() => setDetail(null)} type="button" aria-label="关闭">
                <IconClose size={20} />
              </button>
            </div>
            <div className="grammar-detail-block">
              <div className="tiny">接续</div>
              <div>{detail.formation}</div>
            </div>
            <div className="grammar-detail-block">
              <div className="tiny">例句</div>
              <div style={{ fontSize: 16 }}>{detail.example.ja}</div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {detail.example.zh}
              </div>
              <button className="speak" style={{ marginTop: 8 }} onClick={() => speak(detail.example.ja)} type="button">
                <IconVolume size={15} /> 朗读
              </button>
            </div>
            <div className="grammar-detail-block">
              <div className="tiny">说明</div>
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>{detail.note}</div>
            </div>
            <div className="row wrap" style={{ gap: 5, marginBottom: 12 }}>
              {detail.tags.map((t) => (
                <span className="tag" key={t}>
                  {t}
                </span>
              ))}
            </div>
            <button
              className="btn primary block"
              onClick={() => {
                setDetail(null);
                startPractice();
              }}
              type="button"
            >
              练一组语法题
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
