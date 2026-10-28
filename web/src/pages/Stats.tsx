import { useMemo } from 'react';
import type { Settings, Word, WordProgress } from '../core/types';
import { accuracyOf, forecastRetention, levelStats, recentDays, retentionBuckets } from '../core/stats';
import { masteryScore, retentionAt, DAY, dateKey } from '../core/srs';
import type { DailyRecord } from '../db/store';

/** 图表空态：与其画一张空白坐标轴，不如说明「为什么现在是空的、要做什么才会有数据」 */
function Empty({ text }: { text: string }) {
  return (
    <div className="chart-empty">
      <div className="chart-empty-mark" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M4 19h16" />
          <path d="M7.5 19v-4" />
          <path d="M12 19v-7" />
          <path d="M16.5 19v-2.5" />
        </svg>
      </div>
      <div className="tiny">{text}</div>
    </div>
  );
}


interface Props {
  words: Word[];
  progress: Map<string, WordProgress>;
  daily: Map<string, DailyRecord>;
  settings: Settings;
  now: number;
}

export function Stats({ words, progress, daily, now }: Props) {
  const stats = useMemo(() => {
    const all = [...progress.values()].filter((p) => p.state !== 'new' && p.state !== 'ignored');
    const mastered = all.filter((p) => p.state === 'mastered');
    const logs = [...progress.values()].flatMap((p) => p.history);
    const days = recentDays(now, 14);
    const bars = days.map((d) => {
      const r = daily.get(d);
      return { d, v: r ? r.correct + r.wrong : 0 };
    });
    const forecastDays = [0, 1, 3, 7, 15, 30];
    // 留存预测只针对已进入复习池的词，否则「学习中」的低留存会把曲线拉平
    const fc = forecastRetention(mastered, now, forecastDays);
    const buckets = retentionBuckets(all, now);
    return { all, mastered, logs, bars, forecastDays, fc, buckets };
  }, [progress, daily, now]);

  const levels = useMemo(() => levelStats(words, progress, now, masteryScore), [words, progress, now]);
  const acc = accuracyOf(stats.logs);
  const totalAnswers = stats.logs.length;

  /** 空态判定：没有任何作答记录 / 没有任何已掌握的词，对应的图表没有可展示的信息 */
  const hasStudy = totalAnswers > 0 || stats.bars.some((b) => b.v > 0);
  const hasMastered = stats.mastered.length > 0;
  const hasBuckets = stats.buckets.some((b) => b > 0);

  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const r = daily.get(dateKey(now - i * DAY));
    if (r && r.correct + r.wrong > 0) streak++;
    else if (i > 0) break;
  }

  return (
    <div className="stats-page">
      <div className="stat-grid">
        <div className="stat">
          <div className="v mono">{totalAnswers}</div>
          <div className="k">累计作答</div>
        </div>
        <div className="stat">
          <div className="v mono">{Math.round(acc * 100)}%</div>
          <div className="k">总正确率</div>
        </div>
        <div className="stat">
          <div className="v mono">{streak}</div>
          <div className="k">连续打卡</div>
        </div>
      </div>

      <div className="stats-cols">
        <section className="stats-cell">
          <div className="section-title">近 14 天学习量</div>
          <div className="card">
            {hasStudy ? <BarChart data={stats.bars} /> : <Empty text="还没有学习记录，完成今天的第一组练习后这里会出现柱状图" />}
          </div>
        </section>

        <section className="stats-cell">
          <div className="section-title">记忆留存预测</div>
          <div className="card">
            {hasMastered ? (
              <LineChart xs={stats.forecastDays} ys={stats.fc} />
            ) : (
              <Empty text="熟练掌握任意单词后，这里会显示未来 30 天的记忆留存预测" />
            )}
            <div className="legend">
              <span>
                <i style={{ background: 'var(--accent)' }} />
                预测平均留存率
              </span>
              <span className="muted">按每个词的复习节奏估算，用于观察记忆是否稳固</span>
            </div>
          </div>
        </section>
      </div>

      <div className="stats-cols">
        <section className="stats-cell">
          <div className="section-title">各等级进度</div>
          <div className="card">
            {levels.map((l) => {
              const pct = l.total ? ((l.mastered + l.ignored) / l.total) * 100 : 0;
              return (
                <div key={l.level} style={{ marginBottom: 12 }}>
                  <div className="row between tiny" style={{ marginBottom: 4 }}>
                    <span>
                      {l.level} · 掌握 {l.mastered} / {l.total}
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
        </section>

        <section className="stats-cell">
          <div className="section-title">当前记忆强度分布</div>
          <div className="card">
            {hasBuckets ? <Buckets buckets={stats.buckets} /> : <Empty text="学习并掌握单词后，这里会显示各记忆强度区间的词数" />}
            <div className="legend">
              <span>弱 0-20%</span>
              <span>20-40%</span>
              <span>40-60%</span>
              <span>60-80%</span>
              <span>强 80-100%</span>
            </div>
          </div>
        </section>
      </div>

      <section className="stats-cell">
        <div className="section-title">打卡热力图（近 60 天）</div>
        <div className="card">
          <Heatmap daily={daily} now={now} days={60} />
        </div>
      </section>

      <div className="card tight">
        <div className="tiny">
          说明：留存率根据每个词的复习间隔与熟练程度估算，用于观察记忆趋势，不等同于真实测验成绩。
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------ 小图表（纯 SVG，无第三方依赖） */

function BarChart({ data }: { data: { d: string; v: number }[] }) {
  const w = 660;
  const h = 150;
  const pad = 18;
  const max = Math.max(1, ...data.map((d) => d.v));
  const bw = (w - pad * 2) / data.length;
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {data.map((d, i) => {
        const bh = (d.v / max) * (h - 34);
        const x = pad + i * bw;
        return (
          <g key={d.d}>
            <rect x={x + 2} y={h - 22 - bh} width={bw - 4} height={Math.max(1, bh)} rx={3} fill="var(--accent)" opacity={d.v ? 0.9 : 0.18} />
            {d.v > 0 && (
              <text x={x + bw / 2} y={h - 26 - bh} fontSize="10" fill="var(--ink-2)" textAnchor="middle">
                {d.v}
              </text>
            )}
            <text x={x + bw / 2} y={h - 6} fontSize="9" fill="var(--ink-3)" textAnchor="middle">
              {d.d.slice(5)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ xs, ys }: { xs: number[]; ys: number[] }) {
  const w = 660;
  const h = 150;
  const pad = 26;
  const maxX = Math.max(1, ...xs);
  const px = (i: number) => pad + (xs[i] / maxX) * (w - pad * 2);
  const py = (v: number) => h - 24 - v * (h - 44);
  const path = ys.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ');
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`}>
      {[0, 0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={pad} x2={w - pad} y1={py(g)} y2={py(g)} stroke="var(--border)" strokeDasharray="3 4" />
      ))}
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />
      {ys.map((v, i) => (
        <g key={i}>
          <circle cx={px(i)} cy={py(v)} r="3.5" fill="var(--accent)" />
          <text x={px(i)} y={py(v) - 8} fontSize="10" fill="var(--ink-2)" textAnchor="middle">
            {Math.round(v * 100)}%
          </text>
          <text x={px(i)} y={h - 6} fontSize="9" fill="var(--ink-3)" textAnchor="middle">
            {xs[i]}天
          </text>
        </g>
      ))}
    </svg>
  );
}

function Buckets({ buckets }: { buckets: number[] }) {
  const max = Math.max(1, ...buckets);
  const colors = ['var(--accent)', '#d2705f', 'var(--warn)', '#8fb46a', 'var(--ok)'];
  return (
    <div className="row" style={{ alignItems: 'flex-end', height: 90, gap: 6 }}>
      {buckets.map((b, i) => (
        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{b}</div>
          <div
            style={{
              height: `${(b / max) * 56}px`,
              background: colors[i],
              borderRadius: 6,
              minHeight: 2,
              marginTop: 3,
            }}
          />
        </div>
      ))}
    </div>
  );
}

function Heatmap({ daily, now, days }: { daily: Map<string, DailyRecord>; now: number; days: number }) {
  const cells: { d: string; v: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dateKey(now - i * DAY);
    const r = daily.get(d);
    cells.push({ d, v: r ? r.correct + r.wrong : 0 });
  }
  const level = (v: number) => (v === 0 ? 0 : v < 10 ? 1 : v < 30 ? 2 : v < 60 ? 3 : 4);
  return (
    <>
      <div className="heat">
        {cells.map((c) => (
          <i key={c.d} data-l={level(c.v)} title={`${c.d}: ${c.v} 题`} />
        ))}
      </div>
      <div className="legend">
        <span>少</span>
        <i style={{ background: 'var(--bg-soft)' }} />
        <i style={{ background: 'color-mix(in srgb, var(--accent) 25%, var(--bg-soft))' }} />
        <i style={{ background: 'color-mix(in srgb, var(--accent) 50%, var(--bg-soft))' }} />
        <i style={{ background: 'color-mix(in srgb, var(--accent) 75%, var(--bg-soft))' }} />
        <i style={{ background: 'var(--accent)' }} />
        <span>多</span>
      </div>
    </>
  );
}
