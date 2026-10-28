import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Level, Settings } from '../core/types';
import { LEVELS } from '../core/types';
import {
  EXAM_LEVEL_INFO,
  buildExamPaper,
  formatClock,
  gradeExam,
  toExamRecord,
  type ExamPaper,
  type ExamRecord,
  type ExamResult,
} from '../core/exam';
import { loadLevel } from '../data/loader';
import { loadContent } from '../data/content';
import { clearExams, loadExams, saveExam } from '../db/store';
import { useSpeech } from '../hooks/useSpeech';
import { haptic } from '../platform/native';
import { IconExam } from '../components/icons';
import { ExamRunner } from './ExamRunner';
import { ExamResultView } from './ExamResult';

interface Props {
  settings: Settings;
  onToast: (msg: string) => void;
  onBack: () => void;
  /** 由 App 共享，用于 Android 返回键判断考试是否进行中 */
  runningRef: { current: boolean };
}

type Stage = 'lobby' | 'running' | 'result';

export function Exam({ settings, onToast, onBack, runningRef }: Props) {
  const [stage, setStage] = useState<Stage>('lobby');
  const [level, setLevel] = useState<Level>(settings.levels[0] ?? 'N5');
  const [paper, setPaper] = useState<ExamPaper | null>(null);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [history, setHistory] = useState<ExamRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { status: speechStatus, speak } = useSpeech(0.9);

  useEffect(() => {
    void loadExams()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    runningRef.current = stage === 'running';
    return () => {
      runningRef.current = false;
    };
  }, [stage, runningRef]);

  const info = EXAM_LEVEL_INFO[level];

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [words, content] = await Promise.all([loadLevel(level), loadContent(level)]);
      const p = buildExamPaper({
        level,
        words,
        grammar: content.grammar,
        reading: content.reading,
        listening: content.listening,
      });
      setPaper(p);
      setResult(null);
      setStage('running');
      void haptic('tap');
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [level]);

  const finish = useCallback(
    (answers: Record<string, number | null>, timing: { startedAt: number; finishedAt: number }) => {
      if (!paper) return;
      const r = gradeExam(paper, answers, timing);
      const record = toExamRecord(r);
      setResult(r);
      setStage('result');
      setHistory((prev) => [record, ...prev]);
      void saveExam(record).catch(() => onToast('成绩保存失败，本次结果仅当前可见'));
      void haptic(r.passed ? 'ok' : 'bad');
      onToast(r.passed ? `模考合格 · ${r.totalScore} 分` : `模考结束 · ${r.totalScore} 分`);
    },
    [paper, onToast],
  );

  const backToLobby = useCallback(() => {
    setStage('lobby');
    setPaper(null);
    setResult(null);
    void loadExams().then(setHistory).catch(() => undefined);
  }, []);

  const clearHistory = useCallback(async () => {
    if (!window.confirm('确定清空全部模考成绩？该操作不可撤销。')) return;
    await clearExams();
    setHistory([]);
    onToast('已清空模考记录');
  }, [onToast]);

  const stats = useMemo(() => {
    if (!history.length) return null;
    const passed = history.filter((h) => h.passed).length;
    const best = history.reduce((m, h) => Math.max(m, h.totalScore), 0);
    return { count: history.length, passed, best };
  }, [history]);

  if (stage === 'running' && paper) {
    return <ExamRunner paper={paper} onFinish={finish} onQuit={() => { backToLobby(); onToast('已退出模考，本次不计分'); }} onToast={onToast} />;
  }

  if (stage === 'result' && paper && result) {
    return (
      <ExamResultView
        paper={paper}
        result={result}
        onRetry={() => void start()}
        onBack={backToLobby}
        speak={speak}
      />
    );
  }

  return (
    <div className="exam-lobby">
      <div className="section-head">
        <div>
          <div className="section-kicker">実力試験 · 原创模拟</div>
          <h1 className="section-title-lg">JLPT 模考</h1>
          <div className="tiny" style={{ marginTop: 4 }}>
            按真实科目顺序与合格线作答，限时提交，听力只播一次。题目全部原创，不含历年真题。
          </div>
        </div>
        <div className="exam-lobby-mark" aria-hidden="true">
          <IconExam size={34} />
          <span>模試</span>
        </div>
      </div>

      <div className="card exam-rules">
        <b>考场规则</b>
        <ul>
          <li>按「言语知识 → 阅读 → 听力」分部分作答，每部分单独计时。</li>
          <li>每部分提交后立即锁定，不能返回修改；时间到自动提交。</li>
          <li>听力音频只播放一次，播放结束前也可以作答。</li>
          <li>交卷后统一公布分数与逐题解析；中途退出不计分。</li>
        </ul>
        <div className="exam-note">
          原创题库体量小于真题，因此时长按题量等比压缩；科目顺序、单科最低分与合格线保持与 JLPT 一致。
        </div>
      </div>

      <div className="section-title">选择等级</div>
      <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
        {LEVELS.map((lv) => (
          <button
            key={lv}
            className={`chip${level === lv ? ' active' : ''}`}
            onClick={() => setLevel(lv)}
            type="button"
          >
            {lv}
          </button>
        ))}
      </div>

      <div className="card exam-info">
        <div className="exam-info-head">
          <div>
            <div className="tiny">当前选择</div>
            <div className="exam-info-level mono">{level}</div>
          </div>
          <div className="exam-info-badge">
            <span className="tiny">合格线</span>
            <b className="mono">{info.passScore}</b>
            <span className="tiny">/ {info.totalScore}</span>
          </div>
        </div>
        <div className="exam-info-grid">
          <div>
            <div className="tiny">真实考场 · 笔试</div>
            <div className="mono">{info.official.written} 分钟</div>
          </div>
          <div>
            <div className="tiny">真实考场 · 听力</div>
            <div className="mono">{info.official.listening} 分钟</div>
          </div>
          <div>
            <div className="tiny">单科最低</div>
            <div className="mono">
              {info.sections.map((s) => `${s.short} ${s.minScore}`).join(' · ')}
            </div>
          </div>
          <div>
            <div className="tiny">本卷题量</div>
            <div className="mono">约 37 题 · 约 45 分钟</div>
          </div>
        </div>
        <div className="exam-info-sections">
          {info.sections.map((s) => (
            <span className="tag" key={s.key}>
              {s.label} {s.scoreMax} 分
            </span>
          ))}
        </div>
      </div>

      {speechStatus === 'unavailable' && (
        <div className="card exam-note warn">
          当前设备没有可用的日语语音，听力部分将自动切换为文字模式（仍按原题量计分）。安装日语语音包后可恢复真实听力。
        </div>
      )}

      {error && (
        <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <b>试卷生成失败：</b> {error}
          <div className="tiny">请确认已执行 npm run sync:data，或稍后重试。</div>
        </div>
      )}

      <button className="btn primary block exam-start" onClick={() => void start()} disabled={loading} type="button">
        {loading ? '正在生成试卷…' : `开始 ${level} 模考`}
      </button>
      <div className="tiny" style={{ textAlign: 'center', marginTop: 6 }}>
        每次开始都会重新抽题，生成一份新的试卷。
      </div>

      <div className="row between" style={{ marginTop: 22, alignItems: 'baseline' }}>
        <div className="section-title" style={{ margin: 0 }}>
          历史成绩
        </div>
        {history.length > 0 && (
          <button className="linkbtn" onClick={() => void clearHistory()} type="button">
            清空记录
          </button>
        )}
      </div>

      {stats && (
        <div className="stat-grid three" style={{ marginTop: 10 }}>
          <div className="stat">
            <div className="v mono">{stats.count}</div>
            <div className="k">模考次数</div>
          </div>
          <div className="stat">
            <div className="v mono">{stats.passed}</div>
            <div className="k">合格次数</div>
          </div>
          <div className="stat">
            <div className="v mono">{stats.best}</div>
            <div className="k">最高总分</div>
          </div>
        </div>
      )}

      <div className="exam-history">
        {history.length === 0 && <div className="center-empty">还没有模考记录，选好等级后开始第一次。</div>}
        {history.slice(0, 12).map((h) => (
          <div className="exam-history-row" key={h.id}>
            <div className={`exam-history-level mono${h.level === level ? ' current' : ''}`}>{h.level}</div>
            <div className="exam-history-main">
              <div className="row" style={{ gap: 8 }}>
                <b className="mono">
                  {h.totalScore}/{h.totalMax}
                </b>
                <span className={`tag ${h.passed ? 'green' : 'red'}`}>{h.passed ? '合格' : '未合格'}</span>
              </div>
              <div className="tiny">
                {new Date(h.finishedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {' · '}用时 {formatClock(h.spentSec)}
              </div>
            </div>
            <div className="exam-history-sections">
              {h.sections.map((s) => (
                <span key={s.key} className={`tiny mono${s.passed ? '' : ' exam-fail-text'}`}>
                  {s.short} {s.score}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 18 }}>
        <button className="btn block" onClick={onBack} type="button">
          返回今日
        </button>
      </div>
      <div className="tiny" style={{ marginTop: 10, textAlign: 'center' }}>
        官方样题与考试说明：
        <a href="https://www.jlpt.jp/e/samples/" target="_blank" rel="noreferrer">
          jlpt.jp 官方样题
        </a>
      </div>
    </div>
  );
}
