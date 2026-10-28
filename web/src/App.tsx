import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Level, Settings, WordProgress } from './core/types';
import { DEFAULT_SETTINGS } from './core/types';
import { buildDrillPlan, buildPlan, type Plan } from './core/scheduler';
import { loadLevels, type LevelBundle } from './data/loader';
import {
  bumpDaily,
  exportAll,
  importAll,
  loadDaily,
  loadProgress,
  loadSettings,
  resetAll,
  saveProgress,
  saveSettings,
  type DailyRecord,
} from './db/store';
import { useSpeech } from './hooks/useSpeech';
import {
  syncStatusBar,
  useAndroidBackButton,
  useAppForeground,
  useKeyboardVisibility,
} from './platform/native';
import { Home } from './pages/Home';
import { IconBook, IconChart, IconHome, IconSliders } from './components/icons';
import { BrandLockup, LogoMark } from './components/Brand';
import { Study, type StudySummary } from './pages/Study';
import { Wordbook } from './pages/Wordbook';
import { Stats } from './pages/Stats';
import { Settings as SettingsPage } from './pages/Settings';
import { Onboarding } from './pages/Onboarding';

type Route = 'home' | 'study' | 'book' | 'stats' | 'settings';

const NAV: { key: Route; Icon: (p: { size?: number }) => JSX.Element; label: string }[] = [
  { key: 'home', Icon: IconHome, label: '今日' },
  { key: 'book', Icon: IconBook, label: '词库' },
  { key: 'stats', Icon: IconChart, label: '统计' },
  { key: 'settings', Icon: IconSliders, label: '设置' },
];

export default function App() {
  const [route, setRoute] = useState<Route>('home');
  const [ready, setReady] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [bundle, setBundle] = useState<LevelBundle | null>(null);
  const [progress, setProgress] = useState<Map<string, WordProgress>>(new Map());
  const [daily, setDaily] = useState<Map<string, DailyRecord>>(new Map());
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<string | null>(null);
  const [onlyReview, setOnlyReview] = useState(false);
  const [leechPlan, setLeechPlan] = useState<Plan | null>(null);
  const [bookFilter, setBookFilter] = useState<'all' | 'leech'>('all');
  const [showIntro, setShowIntro] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [speechWarnClosed, setSpeechWarnClosed] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  const { speak, status: speechStatus, error: speechError } = useSpeech(settings.speechRate);

  /**
   * 语音不可用时（如部分 Android WebView / 未装日语语音包的设备），自动剔除听力类题型，
   * 避免出现「听读音拼写」却完全没声音的死题。
   */
  const effectiveSettings = useMemo<Settings>(() => {
    if (speechStatus !== 'unavailable') return settings;
    const modes = settings.modes.filter((m) => !m.startsWith('audio'));
    return modes.length ? { ...settings, modes } : settings;
  }, [settings, speechStatus]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  /* ------------------------------------------------ 初始化 */
  useEffect(() => {
    (async () => {
      const [s, p, d] = await Promise.all([loadSettings(), loadProgress(), loadDaily()]);
      setSettingsState(s);
      setProgress(p);
      setDaily(d);
      setReady(true);
    })();
  }, []);

  /* ------------------------------------------------ 切页回到顶部 */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  /* ------------------------------------------------ 主题与个性化 */
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', settings.theme);
    root.setAttribute('data-accent', settings.accent);
    root.setAttribute('data-paper', settings.paperTexture ? 'on' : 'off');
    root.setAttribute('data-immersive', settings.immersiveStudy ? 'on' : 'off');
    root.setAttribute('data-large-type', settings.largeType ? 'on' : 'off');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#17181a' : '#f7f4ee');
    void syncStatusBar(settings.theme);
  }, [settings.theme, settings.accent, settings.paperTexture, settings.immersiveStudy, settings.largeType]);

  /* ------------------------------------------------ 原生端：返回键 / 前后台 / 键盘 */
  useAndroidBackButton(() => {
    if (route !== 'home') {
      setRoute('home');
      return true;
    }
    return false;
  });
  useAppForeground(() => setNow(Date.now()));
  useKeyboardVisibility((v) => {
    document.documentElement.classList.toggle('kb-open', v);
  });
  useEffect(() => {
    const onToast = (e: Event) => showToast((e as CustomEvent<string>).detail);
    window.addEventListener('kotoba:toast', onToast);
    return () => window.removeEventListener('kotoba:toast', onToast);
  }, [showToast]);

  /* ------------------------------------------------ 时间推进（每分钟） */
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /* ------------------------------------------------ 词库加载 */
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setBundle(null);
    loadLevels(settings.levels)
      .then((b) => {
        if (!cancelled) setBundle(b);
      })
      .catch((e) => setErr(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [ready, settings.levels]);

  /* ------------------------------------------------ 设置持久化 */
  const setSettings = useCallback(
    (s: Settings) => {
      setSettingsState(s);
      void saveSettings(s);
    },
    [],
  );

  /* ------------------------------------------------ 进度更新 */
  const updateProgress = useCallback((items: WordProgress[]) => {
    setProgress((prev) => {
      const m = new Map(prev);
      for (const it of items) m.set(it.id, it);
      return m;
    });
    void saveProgress(items);
  }, []);

  /**
   * 个人释义覆盖：把用户改过的释义合并进词对象，练习、词库、结算都立即生效。
   * 没有自定义释义时直接复用原 bundle，避免无谓重建索引。
   */
  const effectiveBundle = useMemo<LevelBundle | null>(() => {
    if (!bundle) return null;
    let changed = false;
    const words = bundle.words.map((w) => {
      const cz = progress.get(w.id)?.customZh;
      if (cz?.length) {
        changed = true;
        return { ...w, zh: cz };
      }
      return w;
    });
    if (!changed) return bundle;
    const index = new Map(words.map((w) => [w.id, w]));
    const byBucket = new Map<string, typeof words>();
    for (const w of words) {
      const arr = byBucket.get(w.bucket) ?? [];
      arr.push(w);
      byBucket.set(w.bucket, arr);
    }
    return { words, index, byBucket };
  }, [bundle, progress]);

  /* ------------------------------------------------ 今日计划 */
  const plan: Plan | null = useMemo(() => {
    if (!effectiveBundle || !ready) return null;
    return buildPlan({ words: effectiveBundle.words, progress, settings: effectiveSettings, now });
  }, [effectiveBundle, progress, effectiveSettings, now, ready]);

  const activePlan: Plan | null = useMemo(() => {
    if (!plan) return null;
    if (!onlyReview) return plan;
    if (!effectiveBundle) return null;
    return buildPlan({
      words: effectiveBundle.words,
      progress,
      settings: { ...effectiveSettings, newPerDay: 0 },
      now,
    });
  }, [plan, onlyReview, effectiveBundle, progress, effectiveSettings, now]);

  /* ------------------------------------------------ 学习结束 */
  const onFinish = useCallback(
    async (s: StudySummary) => {
      const rec = await bumpDaily(Date.now(), {
        newCount: s.newDone,
        reviewCount: s.reviewDone,
        correct: s.correct,
        wrong: s.done - s.correct,
        seconds: s.seconds,
      });
      setDaily((prev) => new Map(prev).set(rec.date, rec));
      showToast(`完成 ${s.done} 题 · 正确率 ${s.done ? Math.round((s.correct / s.done) * 100) : 0}%`);
    },
    [showToast],
  );

  /* ------------------------------------------------ 数据导入导出 */
  const onExport = useCallback(async () => {
    const next = { ...settings, lastBackupAt: Date.now() };
    setSettingsState(next);
    await saveSettings(next);
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kotoba-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('已导出备份');
  }, [settings, showToast]);

  const onImport = useCallback(
    async (file: File) => {
      if (!window.confirm('导入备份会覆盖当前学习进度与设置，确定继续？建议先导出一份当前数据。')) return;
      try {
        const text = await file.text();
        await importAll(JSON.parse(text));
        const [s, p, d] = await Promise.all([loadSettings(), loadProgress(), loadDaily()]);
        setSettingsState(s);
        setProgress(p);
        setDaily(d);
        showToast('导入成功');
      } catch (e) {
        showToast(`导入失败：${(e as Error).message}`);
      }
    },
    [showToast],
  );

  const onReset = useCallback(async () => {
    if (!window.confirm('确定清空全部学习进度？该操作不可撤销，建议先导出备份。')) return;
    await resetAll();
    setProgress(new Map());
    setDaily(new Map());
    showToast('已清空学习进度');
  }, [showToast]);

  const toggleLevel = useCallback(
    (lv: Level) => {
      const has = settings.levels.includes(lv);
      const next = has ? settings.levels.filter((l) => l !== lv) : [...settings.levels, lv];
      setSettings({ ...settings, levels: next.length ? next : [lv] });
    },
    [settings, setSettings],
  );

  const startStudy = useCallback(
    (reviewOnly: boolean) => {
      const p = reviewOnly ? activePlan : plan;
      if (!p || !p.queue.length) {
        showToast('暂无待练内容，可提高每日词量或选择更多等级');
        return;
      }
      setLeechPlan(null);
      setOnlyReview(reviewOnly);
      setRoute('study');
    },
    [plan, activePlan, showToast],
  );

  const startLeechDrill = useCallback(() => {
    if (!effectiveBundle) return;
    const p = buildDrillPlan(effectiveBundle.words, progress, effectiveSettings, Date.now());
    if (!p.queue.length) {
      showToast('暂时没有易错词，按计划继续学习即可');
      return;
    }
    setLeechPlan(p);
    setOnlyReview(false);
    setRoute('study');
  }, [effectiveBundle, progress, effectiveSettings, showToast]);

  const studyPlan = leechPlan ?? activePlan;

  const go = useCallback((r: Route) => {
    if (r === 'book') setBookFilter('all');
    setRoute(r);
  }, []);

  const finishIntro = useCallback(
    (patch: Partial<Settings>) => {
      setSettings({ ...settings, ...patch, onboarded: true });
      setShowIntro(false);
    },
    [settings, setSettings],
  );

  /* ------------------------------------------------ 渲染 */
  if (!ready) {
    return (
      <>
        <SceneLayer />
        <div className="app">
          <div className="content">
            <div className="center-empty">正在载入…</div>
          </div>
        </div>
      </>
    );
  }

  if (!settings.onboarded || showIntro) {
    return (
      <>
        <SceneLayer />
        <div className="app">
          <Onboarding
            settings={settings}
            onDone={finishIntro}
            onCancel={settings.onboarded ? () => setShowIntro(false) : undefined}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <SceneLayer />
      <div className={`app app-shell route-${route}`}>
        <aside className="sidebar" aria-label="主导航">
        <div className="side-brand">
          <LogoMark size={46} />
          <div>
            <div className="side-name">言葉 Kotoba</div>
            <div className="side-sub">JLPT 词汇训练器</div>
          </div>
        </div>
        <nav className="sidenav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`sidebtn${route === n.key ? ' active' : ''}`}
              onClick={() => go(n.key)}
              type="button"
            >
              <span className="ico">
                <n.Icon size={20} />
              </span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-meta">
            {bundle ? `${bundle.words.length} 词 · ${settings.levels.join(' / ')}` : '词库载入中'}
          </div>
          <div className="side-meta dim">本地存储 · 无需账号</div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <BrandLockup size={34} sub="JLPT 词汇训练器" />
          {bundle && (
            <span className="tiny mono">
              {bundle.words.length} 词 / {settings.levels.join('·')}
            </span>
          )}
        </header>

        <main className="content">
          {err && (
            <div className="card" style={{ borderColor: 'var(--accent)' }}>
              <b>词库加载失败：</b> {err}
              <div className="tiny">请确认已执行 npm run sync:data（或 python scripts/build_dataset.py）。</div>
            </div>
          )}

          {speechError && !speechWarnClosed && (
            <div className="card" style={{ borderColor: 'var(--warn)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <b>语音提示：</b> {speechError}
                  <div className="tiny">
                    听力类题型已自动隐藏，其余题型不受影响。安装日语语音数据后重新打开即可恢复。
                  </div>
                </div>
                <button className="btn sm" type="button" onClick={() => setSpeechWarnClosed(true)}>
                  知道了
                </button>
              </div>
            </div>
          )}

          {route === 'home' && effectiveBundle && (
            <Home
              settings={settings}
              words={effectiveBundle.words}
              progress={progress}
              daily={daily}
              plan={plan}
              now={now}
              onStart={startStudy}
              onToggleLevel={toggleLevel}
              onGo={(r) => go(r)}
              onGoLeech={() => {
                setBookFilter('leech');
                setRoute('book');
              }}
              onDrillLeech={startLeechDrill}
              onBackup={onExport}
              onSetNewPerDay={(n) => {
                setSettings({ ...settings, newPerDay: n });
                showToast(n === 0 ? '已暂停新词，可在设置中恢复' : `每日新词已调整为 ${n}`);
              }}
            />
          )}

          {route === 'study' && effectiveBundle && studyPlan && (
            <Study
              plan={studyPlan}
              bundle={effectiveBundle}
              settings={effectiveSettings}
              progress={progress}
              updateProgress={updateProgress}
              onFinish={onFinish}
              onExit={() => {
                setLeechPlan(null);
                setRoute('home');
                setNow(Date.now());
              }}
              onStats={() => {
                setLeechPlan(null);
                setRoute('stats');
                setNow(Date.now());
              }}
              onToast={showToast}
              speak={speak}
            />
          )}

          {route === 'book' && effectiveBundle && (
            <Wordbook
              words={effectiveBundle.words}
              settings={settings}
              progress={progress}
              updateProgress={updateProgress}
              now={now}
              speak={speak}
              onToast={showToast}
              initialFilter={bookFilter}
            />
          )}

          {route === 'stats' && effectiveBundle && (
            <Stats words={effectiveBundle.words} progress={progress} daily={daily} settings={settings} now={now} />
          )}

          {route === 'settings' && (
            <SettingsPage
              settings={settings}
              setSettings={setSettings}
              onExport={onExport}
              onImport={onImport}
              onReset={onReset}
              onReplayIntro={() => setShowIntro(true)}
            />
          )}

          {!effectiveBundle && route !== 'settings' && !err && <div className="center-empty">正在载入词库…</div>}
        </main>
      </div>

      {route !== 'study' && (
        <nav className="bottomnav">
          {NAV.map((n) => (
            <button
              key={n.key}
              className={`navbtn${route === n.key ? ' active' : ''}`}
              onClick={() => go(n.key)}
              type="button"
            >
              <span className="ico">
                <n.Icon size={22} />
              </span>
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
      )}

      {toast && <div className="toast">{toast}</div>}
      </div>
    </>
  );
}

/** 全屏氛围层：和纸肌理 + 两团极淡的朱/靛色晕染，固定不动，专注时也不抢内容 */
function SceneLayer() {
  return (
    <>
      <div className="ambient" aria-hidden="true">
        <i className="ambient-a" />
        <i className="ambient-b" />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  );
}
