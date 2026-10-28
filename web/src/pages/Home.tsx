import { useMemo } from 'react';
import type { Level, Settings, Word, WordProgress } from '../core/types';
import { LEVELS } from '../core/types';
import { dateKey, DAY, isLeech, needsNextDayCheck } from '../core/srs';
import type { Plan } from '../core/scheduler';
import { estimateMinutes } from '../core/scheduler';
import { computePace } from '../core/pace';
import { reviewLoad } from '../core/stats';
import { ProgressRing } from '../components/ui';
import { IconExam, IconPen } from '../components/icons';
import type { DailyRecord } from '../db/store';

interface Props {
  settings: Settings;
  words: Word[];
  progress: Map<string, WordProgress>;
  daily: Map<string, DailyRecord>;
  plan: Plan | null;
  now: number;
  onStart: (onlyReview: boolean) => void;
  onToggleLevel: (lv: Level) => void;
  onGo: (r: 'book' | 'stats' | 'settings') => void;
  onGoLeech: () => void;
  onDrillLeech: () => void;
  onBackup: () => void;
  onSetNewPerDay: (n: number) => void;
  grammarMastered: number;
  onGoGrammar: () => void;
  onGoExam: () => void;
}

export function Home({
  settings,
  words,
  progress,
  daily,
  plan,
  now,
  onStart,
  onToggleLevel,
  onGo,
  onGoLeech,
  onDrillLeech,
  onBackup,
  onSetNewPerDay,
  grammarMastered,
  onGoGrammar,
  onGoExam,
}: Props) {
  const stats = useMemo(() => {
    let mastered = 0;
    let learning = 0;
    let ignored = 0;
    let unlearned = 0;
    let waiting = 0;
    for (const w of words) {
      const p = progress.get(w.id);
      if (!p || p.state === 'new') unlearned++;
      else if (p.state === 'mastered') mastered++;
      else if (p.state === 'ignored') ignored++;
      else if (p.state === 'learning') {
        learning++;
        if (needsNextDayCheck(p, settings)) waiting++;
      }
    }
    const dueNow = words.filter((w) => {
      const p = progress.get(w.id);
      return p && p.state === 'mastered' && p.due <= now;
    }).length;
    const learningDue = words.filter((w) => {
      const p = progress.get(w.id);
      return p && p.state === 'learning' && p.due <= now;
    }).length;
    return { mastered, learning, ignored, unlearned, waiting, dueNow, learningDue };
  }, [words, progress, now, settings]);

  const pace = useMemo(() => computePace(words, progress, settings, now), [words, progress, settings, now]);

  const load = useMemo(() => reviewLoad([...progress.values()], now, 7), [progress, now]);
  const loadTotal = load.reduce((s, d) => s + d.count, 0);
  const loadMax = Math.max(1, ...load.map((d) => d.count));

  const leeches = useMemo(
    () => words.filter((w) => isLeech(progress.get(w.id))),
    [words, progress],
  );

  const hasStudyData = useMemo(
    () => [...progress.values()].some((p) => p.state !== 'new' || p.history.length > 0),
    [progress],
  );
  const backupStale = hasStudyData && (!settings.lastBackupAt || now - settings.lastBackupAt > 14 * DAY);

  const streak = useMemo(() => {
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const key = dateKey(now - i * DAY);
      const rec = daily.get(key);
      const active = rec && rec.correct + rec.wrong > 0;
      if (active) n++;
      else if (i > 0) break;
    }
    return n;
  }, [daily, now]);

  const today = daily.get(dateKey(now));
  const todayDone = today ? today.correct + today.wrong : 0;
  const hour = new Date(now).getHours();
  const greeting = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now);
  const queueLen = plan?.queue.length ?? 0;
  /**
   * 今日进度按「真实队列」计算，而不是套一个经验公式：
   * 计划总量 = 今日已完成 + 队列剩余，进度环与标题永远自洽。
   */
  const plannedTotal = todayDone + queueLen;

  const perLevel = useMemo(() => {
    const m = new Map<Level, { total: number; mastered: number; ignored: number }>();
    for (const w of words) {
      const cur = m.get(w.level) ?? { total: 0, mastered: 0, ignored: 0 };
      cur.total++;
      const p = progress.get(w.id);
      if (p?.state === 'mastered') cur.mastered++;
      else if (p?.state === 'ignored') cur.ignored++;
      m.set(w.level, cur);
    }
    return m;
  }, [words, progress]);

  const nextReviewText = useMemo(() => {
    const list = words
      .map((w) => progress.get(w.id))
      .filter((p): p is WordProgress => !!p && p.state === 'mastered' && p.due > now);
    if (!list.length) return '暂无已安排复习';
    list.sort((a, b) => a.due - b.due);
    const d = Math.ceil((list[0].due - now) / DAY);
    return `${list.length} 词待后续复习，最近一批约 ${d} 天后`;
  }, [words, progress, now]);

  return (
    <div className="home-page">
      <header className="home-masthead">
        <div className="mast-copy">
          <div className="mast-kicker">
            <i aria-hidden="true" />
            {greeting} · {dateLabel}
          </div>
          <h1 className="mast-title">
            把今天的词，<br className="mast-br" />
            留到明天还记得。
          </h1>
          <div className="mast-sub">
            {streak > 0 ? (
              <>
                已连续学习 <b>{streak}</b> 天
              </>
            ) : (
              <>从今天开始记录</>
            )}
            <span className="mast-sep">·</span>今日已作答 <b>{todayDone}</b> 题
          </div>
        </div>
        <div className="mast-side" aria-hidden="true">
          <span className="mast-seal">一日一語</span>
          <span className="mast-en">ONE WORD A DAY</span>
        </div>
      </header>

      {pace && (
        <div className={`card pace-card${pace.onTrack ? '' : ' warn'}`}>
          <div className="row between">
            <div style={{ minWidth: 0 }}>
              <div className="pace-title">
                {pace.daysLeft > 0 ? (
                  <>
                    距考试 <b className="mono">{pace.daysLeft}</b> 天
                  </>
                ) : pace.daysLeft === 0 ? (
                  '今天是考试日'
                ) : (
                  <>
                    考试日期已过 <b className="mono">{-pace.daysLeft}</b> 天
                  </>
                )}
              </div>
              <div className="tiny" style={{ marginTop: 3 }}>
                {pace.remaining === 0
                  ? '所选等级已全部掌握，接下来保持复习即可'
                  : pace.onTrack
                    ? `每天 ${settings.newPerDay} 个新词，约 ${pace.daysAtCurrentPace} 天覆盖剩余 ${pace.remaining} 词`
                    : `按每天 ${settings.newPerDay} 个新词还需 ${
                        Number.isFinite(pace.daysAtCurrentPace) ? pace.daysAtCurrentPace : '∞'
                      } 天，建议每天 ${pace.recommendedNewPerDay} 词`}
              </div>
            </div>
            <button className="btn sm" onClick={() => onGo('settings')} type="button">
              {pace.onTrack ? '调整' : '调高'}
            </button>
          </div>
          <div className="row between tiny" style={{ marginTop: 10 }}>
            <span>
              已熟练 {pace.mastered} · 已会跳过 {pace.ignored} / {pace.total}
            </span>
            <span className="mono">
              {Math.round(((pace.mastered + pace.ignored) / Math.max(1, pace.total)) * 100)}%
            </span>
          </div>
          <div className="bar blue" style={{ marginTop: 4 }}>
            <i style={{ width: `${((pace.mastered + pace.ignored) / Math.max(1, pace.total)) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="card hero">
        <ProgressRing
          value={Math.min(todayDone, Math.max(plannedTotal, 1))}
          total={Math.max(plannedTotal, 1)}
          label={queueLen > 0 ? '剩余题量' : '已完成'}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {queueLen > 0 ? `今日待练 ${queueLen} 题` : '今日任务已完成'}
          </div>
          <div className="tiny" style={{ marginTop: 4 }}>
            预计 {queueLen ? estimateMinutes(plan!.queue) : 0} 分钟 · 连续打卡 {streak} 天
          </div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            <button className="btn primary sm" onClick={() => onStart(false)} disabled={!queueLen} type="button">
              开始学习
            </button>
            <button className="btn blue sm" onClick={() => onStart(true)} disabled={!stats.dueNow} type="button">
              只复习（{stats.dueNow}）
            </button>
          </div>
        </div>
      </div>

      <div className="card bridge-card">
        <button className="bridge-item" onClick={onGoGrammar} type="button">
          <span className="bridge-icon">
            <IconPen size={22} />
          </span>
          <span className="bridge-copy">
            <b>语法训练</b>
            <span className="tiny">
              {grammarMastered > 0 ? `已掌握 ${grammarMastered} 个语法点` : 'N1–N5 原创语法 · 三种题型'}
            </span>
          </span>
          <span className="bridge-arrow" aria-hidden="true">
            ›
          </span>
        </button>
        <button className="bridge-item" onClick={onGoExam} type="button">
          <span className="bridge-icon exam">
            <IconExam size={22} />
          </span>
          <span className="bridge-copy">
            <b>JLPT 模考</b>
            <span className="tiny">按科目限时 · 听力只播一次</span>
          </span>
          <span className="bridge-arrow" aria-hidden="true">
            ›
          </span>
        </button>
      </div>

      {plan && plan.reviewBacklog > 0 && (
        <div className="card debt-card">
          <div className="row between" style={{ alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <b>复习债 {plan.reviewBacklog} 个</b>
              <div className="tiny" style={{ marginTop: 3 }}>
                今天到期 {stats.dueNow} 个，今日复习上限 {settings.maxReviewPerDay} 个，超出的会顺延。
                继续加新词会让复习越滚越多。
              </div>
            </div>
            <span className="tag warn">先清债</span>
          </div>
          <div className="row wrap" style={{ gap: 8, marginTop: 10 }}>
            <button className="btn sm primary" onClick={() => onStart(true)} type="button">
              只复习今天
            </button>
            {settings.newPerDay > 0 && (
              <button
                className="btn sm"
                onClick={() => onSetNewPerDay(plan.reviewBacklog > settings.maxReviewPerDay ? 0 : Math.max(1, Math.floor(settings.newPerDay / 2)))}
                type="button"
              >
                {plan.reviewBacklog > settings.maxReviewPerDay
                  ? '暂停新词'
                  : `新词减半到 ${Math.max(1, Math.floor(settings.newPerDay / 2))}`}
              </button>
            )}
            <button className="btn sm ghost" onClick={() => onGo('settings')} type="button">
              调整复习上限
            </button>
          </div>
        </div>
      )}

      <div className="stat-grid four">
        <div className="stat">
          <div className="v mono">{stats.mastered}</div>
          <div className="k">已熟练</div>
        </div>
        <div className="stat">
          <div className="v mono">{stats.learning}</div>
          <div className="k">学习中{stats.waiting > 0 ? ` · 待验证 ${stats.waiting}` : ''}</div>
        </div>
        <div className="stat">
          <div className="v mono">{stats.unlearned}</div>
          <div className="k">未学习</div>
        </div>
        <div className="stat">
          <div className="v mono">{stats.ignored}</div>
          <div className="k">已会跳过</div>
        </div>
      </div>
      <div className="tiny" style={{ marginTop: -2, marginBottom: 2 }}>
        熟练 = 连续 {settings.masteryStreak} 次答对
        {settings.crossSessionMastery ? ' + 次日验证通过' : ''}；跳过只算「已会」，不计入熟练。
      </div>

      {leeches.length > 0 && (
        <>
          <div className="section-title">需要重点攻克</div>
          <div className="card leech-card">
            <div className="row between">
              <div style={{ minWidth: 0 }}>
                <b>易错词</b>
                <div className="tiny">{leeches.length} 个词近期反复答错，单独过一遍更划算</div>
              </div>
              <div className="row" style={{ gap: 6, flex: 'none' }}>
                <button className="btn sm" onClick={onGoLeech} type="button">
                  查看
                </button>
                <button className="btn sm primary" onClick={onDrillLeech} type="button">
                  专项练习
                </button>
              </div>
            </div>
            <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
              {leeches.slice(0, 4).map((w) => (
                <span className="chip" key={w.id}>
                  {w.word}
                  <span className="muted">{w.zh[0]}</span>
                </span>
              ))}
              {leeches.length > 4 && <span className="tiny">等 {leeches.length} 个</span>}
            </div>
          </div>
        </>
      )}

      <div className="home-cols">
        <div className="home-col">
          <div className="section-title">未来 7 天复习</div>
          <div className="card tight">
            {loadTotal === 0 ? (
              <div className="tiny">未来 7 天没有到期复习，今天可以专心学新词。</div>
            ) : (
              <>
                <div className="load-chart">
                  {load.map((d) => (
                    <div className="load-col" key={d.key}>
                      <div className="load-num tiny mono">{d.count || ''}</div>
                      <div className="load-bar">
                        <i
                          style={{
                            height: `${Math.max(4, Math.round((d.count / loadMax) * 100))}%`,
                            opacity: d.count ? 1 : 0.18,
                          }}
                        />
                      </div>
                      <div className="load-label tiny">{d.label}</div>
                    </div>
                  ))}
                </div>
                <div className="tiny" style={{ marginTop: 6 }}>
                  已掌握词的到期复习量；「今天」含逾期未复习的词。
                </div>
              </>
            )}
          </div>

          <div className="section-title">选择等级（可多选）</div>
          <div className="card tight">
            <div className="row wrap" style={{ gap: 8 }}>
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  className={`chip${settings.levels.includes(lv) ? ' active' : ''}`}
                  onClick={() => onToggleLevel(lv)}
                  type="button"
                >
                  {lv}
                </button>
              ))}
              <button className="chip blue" onClick={() => onGo('settings')} type="button">
                更多设置
              </button>
            </div>
            <div style={{ marginTop: 12 }}>
              {settings.levels.map((lv) => {
                const s = perLevel.get(lv) ?? { total: 0, mastered: 0, ignored: 0 };
                const covered = s.mastered + s.ignored;
                const pct = s.total ? (covered / s.total) * 100 : 0;
                return (
                  <div key={lv} style={{ marginBottom: 10 }}>
                    <div className="row between tiny" style={{ marginBottom: 4 }}>
                      <span>
                        {lv} · 熟练 {s.mastered}
                        {s.ignored > 0 ? ` · 跳过 ${s.ignored}` : ''} / {s.total}
                      </span>
                      <span className="mono">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="home-col">
          <div className="section-title">今日概览</div>
          <div className="card tight">
            <div className="field">
              <div>
                <div className="label">新学额度</div>
                <div className="desc">
                  已学 {plan?.newDoneToday ?? 0} / {settings.newPerDay}
                </div>
              </div>
              <span className="tag red mono">{Math.max(0, settings.newPerDay - (plan?.newDoneToday ?? 0))} 剩余</span>
            </div>
            <div className="field">
              <div>
                <div className="label">到期复习</div>
                <div className="desc">{nextReviewText}</div>
              </div>
              <span className="tag blue mono">{stats.dueNow}</span>
            </div>
            <div className="field">
              <div>
                <div className="label">待巩固（未达熟练）</div>
                <div className="desc">
                  需连续 {settings.masteryStreak} 次答对{settings.crossSessionMastery ? '，并跨天验证' : ''}才进入复习池
                </div>
              </div>
              <span className="tag warn mono">{stats.learningDue}</span>
            </div>
            <div className="field">
              <div>
                <div className="label">待明日验证</div>
                <div className="desc">连续答对已完成，明天再答对一次即标记熟练</div>
              </div>
              <span className="tag green mono">{stats.waiting}</span>
            </div>
            {!settings.examDate && (
              <div className="field">
                <div>
                  <div className="label">考试倒计时</div>
                  <div className="desc">设置目标日期后，会按剩余词量给出每日配速</div>
                </div>
                <button className="btn sm" onClick={() => onGo('settings')} type="button">
                  设置
                </button>
              </div>
            )}
            {backupStale && (
              <div className="field">
                <div>
                  <div className="label">备份提醒</div>
                  <div className="desc">
                    {settings.lastBackupAt
                      ? `上次备份于 ${Math.floor((now - settings.lastBackupAt) / DAY)} 天前`
                      : '还没有导出过备份'}
                    ，记录只保存在本机
                  </div>
                </div>
                <button className="btn sm" onClick={onBackup} type="button">
                  导出
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="row home-footer-links" style={{ gap: 8 }}>
        <button className="btn block" onClick={() => onGo('book')} type="button">
          词库浏览
        </button>
        <button className="btn block" onClick={() => onGo('stats')} type="button">
          学习统计
        </button>
      </div>
    </div>
  );
}
