import { useEffect, useMemo, useState } from 'react';
import type { Level, Settings, Word, WordProgress } from '../core/types';
import { LEVELS, MODE_LABEL } from '../core/types';
import { searchWords } from '../data/loader';
import { isLeech, masteryScore, newProgress, stateLabel } from '../core/srs';
import { WordDetail, Modal } from '../components/ui';
import { IconVolume } from '../components/icons';

type Filter = 'all' | 'new' | 'learning' | 'mastered' | 'ignored' | 'favorite' | 'note' | 'leech';

interface Props {
  words: Word[];
  settings: Settings;
  progress: Map<string, WordProgress>;
  updateProgress: (items: WordProgress[]) => void;
  now: number;
  speak: (t: string) => void;
  onToast?: (msg: string) => void;
  /** 从首页「易错词 → 去攻克」进入时直接切到易错筛选 */
  initialFilter?: 'all' | 'leech';
}

const BUCKET_LABEL: Record<string, string> = {
  N: '名词',
  V: '动词',
  ADJ: '形容词',
  ADV: '副词',
  EXP: '短语/其他',
  AFFIX: '词缀',
  OTHER: '未分类',
};

export function Wordbook({ words, settings, progress, updateProgress, now, speak, onToast, initialFilter = 'all' }: Props) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [level, setLevel] = useState<Level | 'ALL'>('ALL');
  const [bucket, setBucket] = useState<string>('ALL');
  const [openId, setOpenId] = useState<string | null>(null);
  const [limit, setLimit] = useState(60);
  const [noteDraft, setNoteDraft] = useState('');
  const [glossDraft, setGlossDraft] = useState('');

  const leechCount = useMemo(
    () => words.filter((w) => isLeech(progress.get(w.id))).length,
    [words, progress],
  );
  const favoriteCount = useMemo(
    () => words.filter((w) => progress.get(w.id)?.favorite).length,
    [words, progress],
  );
  const noteCount = useMemo(
    () =>
      words.filter((w) => {
        const p = progress.get(w.id);
        return !!p?.note?.trim() || !!p?.customZh?.length;
      }).length,
    [words, progress],
  );

  const list = useMemo(() => {
    const extraText = (w: Word) => {
      const p = progress.get(w.id);
      return [p?.note ?? '', ...(p?.customZh ?? [])].join(' ');
    };
    let base = q.trim() ? searchWords(words, q, 400, extraText) : words;
    if (level !== 'ALL') base = base.filter((w) => w.level === level);
    if (bucket !== 'ALL') base = base.filter((w) => w.bucket === bucket);
    base = base.filter((w) => {
      const p = progress.get(w.id);
      switch (filter) {
        case 'new':
          return !p || p.state === 'new';
        case 'learning':
          return p?.state === 'learning';
        case 'mastered':
          return p?.state === 'mastered';
        case 'ignored':
          return p?.state === 'ignored';
        case 'favorite':
          return !!p?.favorite;
        case 'note':
          return !!p?.note?.trim() || !!p?.customZh?.length;
        case 'leech':
          return isLeech(p);
        default:
          return true;
      }
    });
    return base;
  }, [words, q, level, bucket, filter, progress]);

  const shown = list.slice(0, limit);
  const openWord = openId ? words.find((w) => w.id === openId) : undefined;
  const openProgress = openId ? progress.get(openId) : undefined;

  useEffect(() => {
    const p = openId ? progress.get(openId) : undefined;
    setNoteDraft(p?.note ?? '');
    setGlossDraft((p?.customZh ?? []).join('；'));
  }, [openId]);

  const setFavorite = (w: Word, on: boolean) => {
    const p = progress.get(w.id) ?? newProgress(w.id, w.level, settings);
    updateProgress([{ ...p, favorite: on, state: p.state === 'new' ? 'new' : p.state }]);
  };
  const setIgnored = (w: Word, on: boolean) => {
    const p = progress.get(w.id) ?? newProgress(w.id, w.level, settings);
    updateProgress([{ ...p, state: on ? 'ignored' : 'new', favorite: p.favorite }]);
  };
  const resetWord = (w: Word) => {
    const prev = progress.get(w.id);
    updateProgress([
      {
        ...newProgress(w.id, w.level, settings),
        favorite: prev?.favorite,
        note: prev?.note,
        customZh: prev?.customZh,
      },
    ]);
  };

  const saveNote = (w: Word) => {
    const p = progress.get(w.id) ?? newProgress(w.id, w.level, settings);
    const customZh = glossDraft
      .split(/[;；\n]+/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 4);
    updateProgress([
      {
        ...p,
        note: noteDraft.trim() || undefined,
        customZh: customZh.length ? customZh : undefined,
      },
    ]);
    onToast?.('个人释义与笔记已保存');
  };
  const addToday = (w: Word) => {
    const p = progress.get(w.id) ?? newProgress(w.id, w.level, settings);
    updateProgress([{ ...p, state: 'learning', due: Date.now(), firstSeen: p.firstSeen ?? Date.now() }]);
  };

  return (
    <div className="book-page">
      <div className="book-side">
        <div className="searchbar">
        <input
          value={q}
          placeholder="搜索：日文 / 假名 / 罗马字 / 中文 / 笔记"
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(60);
          }}
        />
        {q && (
          <button className="btn sm" onClick={() => setQ('')} type="button">
            清空
          </button>
        )}
      </div>

      <div className="card tight">
        <div className="tiny" style={{ marginBottom: 4 }}>
          学习状态
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {(['all', 'new', 'learning', 'mastered', 'ignored'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f === 'all' ? '全部' : stateLabel(f as never)}
            </button>
          ))}
        </div>
        <div className="tiny" style={{ marginTop: 8, marginBottom: 4 }}>
          我的
        </div>
        <div className="row wrap" style={{ gap: 6 }}>
          {(['favorite', 'note', 'leech'] as Filter[]).map((f) => (
            <button
              key={f}
              className={`chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
              type="button"
            >
              {f === 'favorite'
                ? `收藏${favoriteCount ? ` ${favoriteCount}` : ''}`
                : f === 'note'
                  ? `有笔记${noteCount ? ` ${noteCount}` : ''}`
                  : `易错${leechCount ? ` ${leechCount}` : ''}`}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <button
            className={`chip blue${level === 'ALL' ? ' active' : ''}`}
            onClick={() => setLevel('ALL')}
            type="button"
          >
            全部等级
          </button>
          {LEVELS.map((lv) => (
            <button
              key={lv}
              className={`chip blue${level === lv ? ' active' : ''}`}
              onClick={() => setLevel(lv)}
              type="button"
            >
              {lv}
            </button>
          ))}
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
          <button
            className={`chip${bucket === 'ALL' ? ' active' : ''}`}
            onClick={() => setBucket('ALL')}
            type="button"
          >
            全部词性
          </button>
          {Object.keys(BUCKET_LABEL).map((b) => (
            <button
              key={b}
              className={`chip${bucket === b ? ' active' : ''}`}
              onClick={() => setBucket(b)}
              type="button"
            >
              {BUCKET_LABEL[b]}
            </button>
          ))}
        </div>
        <div className="tiny" style={{ marginTop: 10 }}>
          共 {list.length} 条{list.length > shown.length ? `，显示前 ${shown.length} 条` : ''}
        </div>
      </div>
      </div>

      <div className="book-main">
        <div className="card">
          {shown.length === 0 && <div className="center-empty">没有匹配的词条</div>}
        {shown.map((w) => {
          const p = progress.get(w.id);
          const m = p ? masteryScore(p, now) : 0;
          return (
            <div className="wrow" key={w.id}>
              <div className="grow" onClick={() => setOpenId(w.id)} role="button">
                <div className="row" style={{ gap: 6 }}>
                  <span className="w">{w.word}</span>
                  <span className="r">{w.reading}</span>
                  {p?.favorite && <span className="tag warn">★</span>}
                  {p?.state === 'ignored' && <span className="tag">已会</span>}
                  {isLeech(p) && <span className="tag red">易错</span>}
                  {(p?.note?.trim() || p?.customZh?.length) && <span className="tag blue">笔记</span>}
                </div>
                <div className="m ellipsis">
                  <span className="wpos">{w.pos.join('·')}</span>
                  <b>{w.zh[0]}</b>
                  {w.zh.length > 1 ? `；${w.zh.slice(1).join('；')}` : ''}
                </div>
              </div>
              {p && p.state !== 'new' && p.state !== 'ignored' ? (
                <div className="meter" title={`熟练度 ${Math.round(m * 100)}%`}>
                  <i
                    style={{
                      width: `${Math.max(4, Math.round(m * 100))}%`,
                      background: p.state === 'mastered' ? 'var(--ok)' : 'var(--warn)',
                    }}
                  />
                </div>
              ) : !p || p.state === 'new' ? (
                <span className="meter-idle">未学</span>
              ) : null}
              <button className="btn sm ghost" onClick={() => speak(w.reading)} type="button" aria-label="朗读">
                <IconVolume size={15} />
              </button>
            </div>
          );
        })}
        {list.length > shown.length && (
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + 60)} type="button">
            加载更多
          </button>
        )}
      </div>
      </div>

      <Modal open={!!openWord} onClose={() => setOpenId(null)}>
        {openWord && (
          <>
            <WordDetail
              word={openWord}
              showRomaji={settings.showRomaji}
              onSpeak={speak}
              note={openProgress?.note}
              confusions={words.filter((w) => openWord.cf.includes(w.id))}
              onOpenWord={(id) => setOpenId(id)}
            />
            {openProgress && (
              <div className="card tight" style={{ marginTop: 12 }}>
                <div className="row wrap tiny" style={{ gap: 8 }}>
                  <span className="tag">{stateLabel(openProgress.state)}</span>
                  <span className="tag">连续正确 {openProgress.streak}</span>
                  <span className="tag">阶段 {openProgress.stage + 1}</span>
                  <span className="tag">难度因子 {openProgress.ease.toFixed(2)}</span>
                  <span className="tag">遗忘 {openProgress.lapses} 次</span>
                  <span className="tag">下次复习 {openProgress.due ? new Date(openProgress.due).toLocaleDateString() : '—'}</span>
                </div>
              </div>
            )}
            <div className="card tight" style={{ marginTop: 12 }}>
              <div className="label" style={{ fontWeight: 600 }}>
                个人释义（可选）
              </div>
              <input
                className="note-gloss"
                value={glossDraft}
                placeholder="留空则使用词库释义；多条用分号隔开"
                onChange={(e) => setGlossDraft(e.target.value)}
              />
              <div className="label" style={{ fontWeight: 600, marginTop: 10 }}>
                我的笔记
              </div>
              <textarea
                className="note-input"
                rows={3}
                value={noteDraft}
                placeholder="记录搭配、易错点、近义词、专业术语解释…"
                onChange={(e) => setNoteDraft(e.target.value)}
              />
              <div className="row between" style={{ marginTop: 8 }}>
                <span className="tiny">保存在本机，可被上方搜索框检索</span>
                <button className="btn sm primary" onClick={() => saveNote(openWord)} type="button">
                  保存
                </button>
              </div>
            </div>
            <div className="row wrap" style={{ marginTop: 12, gap: 8 }}>
              <button className="btn sm" onClick={() => setFavorite(openWord, !openProgress?.favorite)} type="button">
                {openProgress?.favorite ? '取消收藏' : '收藏'}
              </button>
              <button className="btn sm" onClick={() => addToday(openWord)} type="button">
                加入今日学习
              </button>
              <button className="btn sm" onClick={() => setIgnored(openWord, openProgress?.state !== 'ignored')} type="button">
                {openProgress?.state === 'ignored' ? '取消忽略' : '忽略该词'}
              </button>
              <button className="btn sm" onClick={() => resetWord(openWord)} type="button">
                重置进度
              </button>
            </div>
            <div className="tiny" style={{ marginTop: 10 }}>
              当前启用题型：{settings.modes.map((m) => MODE_LABEL[m]).join('、')}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
