import { useRef, useState } from 'react';
import type { AccentKey, Level, QuizMode, Settings } from '../core/types';
import { ALL_MODES, LEVELS, MODE_LABEL } from '../core/types';
import { Switch } from '../components/ui';
import { DAY, dayStart } from '../core/srs';
import { parseDateKey } from '../core/pace';

const ACCENTS: { key: AccentKey; label: string; color: string }[] = [
  { key: 'vermilion', label: '朱', color: '#c0392b' },
  { key: 'indigo', label: '靛', color: '#355f8c' },
  { key: 'moss', label: '松', color: '#4f7355' },
  { key: 'plum', label: '梅', color: '#8a4a67' },
];

const MODE_PRESETS: { key: string; label: string; desc: string; modes: QuizMode[] }[] = [
  {
    key: 'recall',
    label: '回忆优先',
    desc: '少做纯认读，多从中文或读音回忆',
    modes: ['zh2jp', 'jp2reading', 'audio2jp', 'reading2jp', 'typing', 'cloze'],
  },
  { key: 'listening', label: '听力优先', desc: '以听音辨词和听写为主', modes: ['audio2jp', 'audio2zh', 'typing', 'cloze'] },
  { key: 'spelling', label: '拼写强化', desc: '重点练假名拼写与反向回忆', modes: ['typing', 'reading2jp', 'cloze', 'zh2jp'] },
  { key: 'reading', label: '认读起步', desc: '刚入门时先建立字形与词义联系', modes: ['jp2zh', 'jp2reading', 'audio2zh', 'cloze'] },
];

/** 这些题型要求主动回忆，而不是看到日语后凭眼熟猜中文 */
const RECALL_MODES: QuizMode[] = ['zh2jp', 'jp2reading', 'reading2jp', 'typing', 'audio2jp', 'cloze'];

interface Props {
  settings: Settings;
  setSettings: (s: Settings) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
  onReplayIntro: () => void;
}

export function Settings({ settings, setSettings, onExport, onImport, onReset, onReplayIntro }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [intervalText, setIntervalText] = useState(settings.intervalDays.join(','));

  const patch = (p: Partial<Settings>) => setSettings({ ...settings, ...p });

  const examTs = parseDateKey(settings.examDate);
  const examDaysLeft = examTs == null ? null : Math.round((dayStart(examTs) - dayStart(Date.now())) / DAY);

  const toggleLevel = (lv: Level) => {
    const has = settings.levels.includes(lv);
    const next = has ? settings.levels.filter((l) => l !== lv) : [...settings.levels, lv];
    patch({ levels: next.length ? next : [lv] });
  };

  const toggleMode = (m: QuizMode) => {
    const has = settings.modes.includes(m);
    const next = has ? settings.modes.filter((x) => x !== m) : [...settings.modes, m];
    patch({ modes: next.length ? next : [m] });
  };

  return (
    <div className="settings-page">
      <section className="settings-section">
        <div className="section-title">学习范围</div>
        <div className="card">
        <div className="field">
          <div>
            <div className="label">JLPT 等级</div>
            <div className="desc">只会推送所选等级的词汇</div>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {LEVELS.map((lv) => (
            <button
              key={lv}
              className={`chip${settings.levels.includes(lv) ? ' active' : ''}`}
              onClick={() => toggleLevel(lv)}
              type="button"
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <div>
            <div className="label">每日新学词数</div>
            <div className="desc">0 表示只复习不学新词</div>
          </div>
          <input
            type="number"
            min={0}
            max={200}
            value={settings.newPerDay}
            onChange={(e) => patch({ newPerDay: Math.max(0, Math.min(200, +e.target.value)) })}
          />
        </div>
        <div className="field">
          <div>
            <div className="label">每日复习上限</div>
            <div className="desc">超出部分顺延到后续几天</div>
          </div>
          <input
            type="number"
            min={10}
            max={600}
            value={settings.maxReviewPerDay}
            onChange={(e) => patch({ maxReviewPerDay: Math.max(10, Math.min(600, +e.target.value)) })}
          />
        </div>
        <div className="field">
          <div>
            <div className="label">新词抽取顺序</div>
            <div className="desc">顺序 = 按词库编号推进；随机 = 全库随机</div>
          </div>
          <select value={settings.orderStrategy} onChange={(e) => patch({ orderStrategy: e.target.value as never })}>
            <option value="sequential">顺序</option>
            <option value="random">随机</option>
          </select>
        </div>
        <div className="field">
          <div>
            <div className="label">目标考试日期</div>
            <div className="desc">
              {examDaysLeft == null
                ? '选填。设置后首页会按剩余词量计算每日配速'
                : examDaysLeft > 0
                  ? `还有 ${examDaysLeft} 天，可根据首页提示调整每日新词`
                  : examDaysLeft === 0
                    ? '今天是考试日，保持复习即可'
                    : '日期已过，可重新设置下一场考试'}
            </div>
          </div>
          <input
            type="date"
            value={settings.examDate}
            onChange={(e) => patch({ examDate: e.target.value })}
          />
        </div>
      </div>
      </section>

      <section className="settings-section">
        <div className="section-title">掌握规则</div>
        <div className="card">
        <div className="field">
          <div>
            <div className="label">连续正确次数</div>
            <div className="desc">
              达到该次数后标记为「熟练」。默认 3 次；调高更稳，但每个词需要更多练习。
            </div>
          </div>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.masteryStreak}
            onChange={(e) => patch({ masteryStreak: Math.max(1, Math.min(10, +e.target.value)) })}
          />
        </div>
        <div className="field">
          <div>
            <div className="label">要求跨天掌握</div>
            <div className="desc">开启后，正确次数需分布在至少 2 个不同日期，防止瞬时记忆造成假熟练</div>
          </div>
          <Switch on={settings.crossSessionMastery} onChange={(v) => patch({ crossSessionMastery: v })} />
        </div>
        <div className="field">
          <div>
            <div className="label">答错后重练延迟（分钟）</div>
            <div className="desc">答错时该词稍后再次出现</div>
          </div>
          <input
            type="number"
            min={1}
            max={120}
            value={settings.relearnDelayMinutes}
            onChange={(e) => patch({ relearnDelayMinutes: Math.max(1, Math.min(120, +e.target.value)) })}
          />
        </div>
        <div className="field">
          <div>
            <div className="label">单词当日最多重练次数</div>
            <div className="desc">同一词在一轮内答错后重复出现的上限</div>
          </div>
          <input
            type="number"
            min={1}
            max={10}
            value={settings.maxRepeatPerWord}
            onChange={(e) => patch({ maxRepeatPerWord: Math.max(1, Math.min(10, +e.target.value)) })}
          />
        </div>
      </div>
      </section>

      <section className="settings-section">
        <div className="section-title">艾宾浩斯复习</div>
        <div className="card">
        <div className="field">
          <div>
            <div className="label">间隔序列（天）</div>
            <div className="desc">以英文逗号分隔，按阶段递增</div>
          </div>
          <input
            type="text"
            value={intervalText}
            style={{ width: 160 }}
            onChange={(e) => setIntervalText(e.target.value)}
            onBlur={() => {
              const parsed = intervalText
                .split(/[,，\s]+/)
                .map((x) => parseInt(x, 10))
                .filter((x) => Number.isFinite(x) && x > 0);
              patch({ intervalDays: parsed.length ? parsed : [1, 2, 4, 7, 15, 30, 60, 120, 240] });
              setIntervalText((parsed.length ? parsed : [1, 2, 4, 7, 15, 30, 60, 120, 240]).join(','));
            }}
          />
        </div>
        <div className="field">
          <div>
            <div className="label">难度因子初值</div>
            <div className="desc">答对放宽间隔、答错收紧，范围 {settings.easeMin} ~ {settings.easeMax}</div>
          </div>
          <input
            type="number"
            step={0.1}
            min={1.3}
            max={2.8}
            value={settings.easeInit}
            onChange={(e) => patch({ easeInit: Math.max(1.3, Math.min(2.8, +e.target.value)) })}
          />
        </div>
        <div className="tiny">
          已掌握的词按阶段推进；严重逾期后才答对的词不升阶，避免"拖够久再答对就跳级"。
          <br />
          逾期不会自动核销：无论多久没复习，已掌握的词都会留在复习队列里，直到你真正答对或连续答错降级。
        </div>
      </div>
      </section>

      <section className="settings-section">
        <div className="section-title">题型</div>
        <div className="card">
        <div className="tiny" style={{ marginBottom: 8 }}>
          快速方案（可再手动微调）
        </div>
        <div className="row wrap" style={{ gap: 6, marginBottom: 12 }}>
          {MODE_PRESETS.map((p) => (
            <button
              key={p.key}
              className="chip blue"
              onClick={() => patch({ modes: p.modes })}
              type="button"
              title={p.desc}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {ALL_MODES.map((m) => (
            <button
              key={m}
              className={`chip${settings.modes.includes(m) ? ' active' : ''}`}
              onClick={() => toggleMode(m)}
              type="button"
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <div>
            <div className="label">选项数量</div>
            <div className="desc">选择题的候选数量</div>
          </div>
          <select value={settings.optionCount} onChange={(e) => patch({ optionCount: +e.target.value as 4 | 6 })}>
            <option value={4}>4 个</option>
            <option value={6}>6 个</option>
          </select>
        </div>
        <div className="field">
          <div>
            <div className="label">干扰项强度</div>
            <div className="desc">越高越倾向挑选形近·音近·同词性的易混淆词</div>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.1}
            value={settings.distractorHardness}
            onChange={(e) => patch({ distractorHardness: +e.target.value })}
          />
        </div>
        {!settings.modes.some((m) => RECALL_MODES.includes(m)) && (
          <div className="tiny" style={{ color: 'var(--warn)', paddingTop: 6 }}>
            当前题型全是「看到日语选中文」，容易靠印象猜对。建议至少保留「看汉字选读音」或「拼写」。
          </div>
        )}
      </div>
      </section>

      <section className="settings-section">
        <div className="section-title">个性化</div>
        <div className="card">
          <div className="field" style={{ borderBottom: 'none', paddingBottom: 4 }}>
            <div>
              <div className="label">强调色</div>
              <div className="desc">按钮、进度条与印章会一起换色</div>
            </div>
          </div>
          <div className="accent-picks">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                className={`accent-pick${settings.accent === a.key ? ' on' : ''}`}
                onClick={() => patch({ accent: a.key })}
                type="button"
              >
                <i style={{ background: a.color }} aria-hidden="true" />
                {a.label}
              </button>
            ))}
          </div>
          <div className="field">
            <div>
              <div className="label">和纸肌理</div>
              <div className="desc">细微纸纹与角落光晕，减少纯色屏幕的单调</div>
            </div>
            <Switch on={settings.paperTexture} onChange={(v) => patch({ paperTexture: v })} />
          </div>
          <div className="field">
            <div>
              <div className="label">学习页沉浸背景</div>
              <div className="desc">作答时只留下题目与柔和底色，进入专注状态</div>
            </div>
            <Switch on={settings.immersiveStudy} onChange={(v) => patch({ immersiveStudy: v })} />
          </div>
          <div className="field">
            <div>
              <div className="label">学习页大字</div>
              <div className="desc">放大题干与选项，适合小屏或长时间阅读</div>
            </div>
            <Switch on={settings.largeType} onChange={(v) => patch({ largeType: v })} />
          </div>
          <div className="tiny" style={{ marginTop: 8 }}>
            这些外观设置只影响本机显示，会随备份一起导出。
          </div>
        </div>
      </section>

      <section className="settings-section">
        <div className="section-title">显示与语音</div>
        <div className="card">
        <div className="field">
          <div className="label">显示假名读音</div>
          <Switch on={settings.showFurigana} onChange={(v) => patch({ showFurigana: v })} />
        </div>
        <div className="field">
          <div className="label">显示罗马字</div>
          <Switch on={settings.showRomaji} onChange={(v) => patch({ showRomaji: v })} />
        </div>
        <div className="field">
          <div className="label">自动朗读题干</div>
          <Switch on={settings.autoSpeak} onChange={(v) => patch({ autoSpeak: v })} />
        </div>
        <div className="field">
          <div className="label">语速</div>
          <input
            type="range"
            min={0.5}
            max={1.4}
            step={0.05}
            value={settings.speechRate}
            onChange={(e) => patch({ speechRate: +e.target.value })}
          />
        </div>
        <div className="field">
          <div className="label">深色主题</div>
          <Switch on={settings.theme === 'dark'} onChange={(v) => patch({ theme: v ? 'dark' : 'light' })} />
        </div>
        <div className="tiny" style={{ marginTop: 8 }}>
          朗读使用系统日语 TTS，并优先把假名读音交给引擎，避免汉字多音字读错。
          音调由系统语音库决定，本应用不提供东京腔调标注；若发音异常，请在系统中安装或切换日语语音包。
        </div>
      </div>
      </section>

      <section className="settings-section">
        <div className="section-title">数据</div>
        <div className="card">
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn sm" onClick={onExport} type="button">
            导出备份
          </button>
          <button className="btn sm" onClick={() => fileRef.current?.click()} type="button">
            导入备份
          </button>
          <button className="btn sm" onClick={onReset} type="button">
            清空学习进度
          </button>
          <button className="btn sm" onClick={onReplayIntro} type="button">
            重看新手引导
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
        <div className="tiny" style={{ marginTop: 10 }}>
          上次备份：{settings.lastBackupAt ? new Date(settings.lastBackupAt).toLocaleString() : '尚未导出'}
          <br />
          所有学习数据保存在本机浏览器数据库（IndexedDB），不上传服务器；清除浏览器数据会导致进度丢失，建议定期导出备份。
        </div>
        </div>
      </section>
    </div>
  );
}
