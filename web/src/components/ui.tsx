import type { ReactNode } from 'react';
import type { RubyPiece, Word } from '../core/types';
import { IconVolume } from './icons';

/* -------------------------------------------------- 环形进度 */
export function ProgressRing({
  value,
  total,
  size = 104,
  stroke = 10,
  color = 'var(--accent)',
  label = '剩余',
}: {
  value: number;
  total: number;
  size?: number;
  stroke?: number;
  color?: string;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset .4s' }}
        />
      </svg>
      <div className="center">
        <div className="num mono">{total - value}</div>
        <div className="lb">{label}</div>
      </div>
    </div>
  );
}

/* -------------------------------------------------- 假名注音渲染 */
function rubyPiece(p: RubyPiece, key: number) {
  return p.r ? (
    <ruby key={key}>
      {p.t}
      <rt>{p.r}</rt>
    </ruby>
  ) : (
    <span key={key}>{p.t}</span>
  );
}

/** mark 用于在例句中高亮目标词，便于把词义和用法对应起来 */
export function Ruby({
  pieces,
  text,
  mark,
}: {
  pieces?: RubyPiece[];
  text?: string;
  mark?: string;
}) {
  const full = pieces?.length ? pieces.map((p) => p.t).join('') : (text ?? '');
  // 例句中的动词/形容词常发生活用（会う→会いました），精确匹配不到时退回汉字词干
  let target = mark ?? '';
  if (target && !full.includes(target) && /[\u4e00-\u9fff々]/.test(target)) {
    const stem = target.replace(/[\u3040-\u309f]+$/, '');
    if (stem && stem.length < target.length && full.includes(stem)) target = stem;
  }
  if (!target || !full.includes(target)) {
    if (!pieces?.length) return <>{text ?? ''}</>;
    return <>{pieces.map((p, i) => rubyPiece(p, i))}</>;
  }
  const start = full.indexOf(target);
  const end = start + target.length;

  if (!pieces?.length) {
    return (
      <>
        {full.slice(0, start)}
        <mark className="hl">{target}</mark>
        {full.slice(end)}
      </>
    );
  }

  let offset = 0;
  return (
    <>
      {pieces.map((p, i) => {
        const ps = offset;
        const pe = offset + p.t.length;
        offset = pe;
        if (pe <= start || ps >= end) return rubyPiece(p, i);
        const localStart = Math.max(0, start - ps);
        const localEnd = Math.min(p.t.length, end - ps);
        if (localStart === 0 && localEnd === p.t.length) {
          return (
            <mark className="hl" key={i}>
              {p.r ? (
                <ruby>
                  {p.t}
                  <rt>{p.r}</rt>
                </ruby>
              ) : (
                p.t
              )}
            </mark>
          );
        }
        // 目标词跨越多段注音时退化为普通文本，避免拆坏 ruby 对齐
        return (
          <span key={i}>
            {p.t.slice(0, localStart)}
            <mark className="hl">{p.t.slice(localStart, localEnd)}</mark>
            {p.t.slice(localEnd)}
          </span>
        );
      })}
    </>
  );
}

/* -------------------------------------------------- 单词主展示 */
export function WordHeading({
  word,
  showFurigana,
  showRomaji,
  big = true,
}: {
  word: Word;
  showFurigana: boolean;
  showRomaji: boolean;
  big?: boolean;
}) {
  return (
    <div>
      <div className={big ? 'qword' : ''} style={big ? undefined : { fontSize: 22, fontWeight: 700 }}>
        {showFurigana && word.example?.ruby ? null : null}
        {word.word}
      </div>
      {showFurigana && (
        <div className="qsub">
          {word.reading}
          {showRomaji && word.romaji ? ` · ${word.romaji}` : ''}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------- 词性与释义 */
export function PosTags({ pos, label = '词性' }: { pos: string[]; label?: string }) {
  if (!pos.length) return null;
  return (
    <div className="pos-tags">
      <span className="pos-key">{label}</span>
      {pos.map((p) => (
        <span className="pos-pill" key={p}>
          {p}
        </span>
      ))}
    </div>
  );
}

/** 第一条为常用义，加粗显示；其余义项降一档，保持可扫读 */
export function GlossList({
  items,
  numbered = true,
  compact = false,
}: {
  items: string[];
  numbered?: boolean;
  compact?: boolean;
}) {
  if (!items.length) return null;
  return (
    <div className={`gloss-list${compact ? ' compact' : ''}`}>
      {items.map((z, i) => (
        <div className="gloss-item" key={i}>
          {numbered && <span className="gloss-no">{i + 1}</span>}
          {i === 0 ? <b className="gloss-main">{z}</b> : <span className="gloss-sub">{z}</span>}
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------- 掌握度条 */
export function Meter({ value, color = 'var(--ok)' }: { value: number; color?: string }) {
  return (
    <div className="bar green" style={{ height: 6, width: 54 }}>
      <i style={{ width: `${Math.round(value * 100)}%`, background: color }} />
    </div>
  );
}

/* -------------------------------------------------- 开关 */
export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`switch${on ? ' on' : ''}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label="开关"
      type="button"
    />
  );
}

/* -------------------------------------------------- 底部弹层 */
export function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------- 词条详情 */
export function WordDetail({
  word,
  showRomaji,
  onSpeak,
  note,
  confusions = [],
  onOpenWord,
}: {
  word: Word;
  showRomaji: boolean;
  onSpeak: (t: string) => void;
  /** 用户个人笔记，练习反馈中一并展示 */
  note?: string;
  /** 预计算的形近/音近词，帮助用户主动区分易混词 */
  confusions?: Word[];
  onOpenWord?: (id: string) => void;
}) {
  return (
    <div>
      <div className="row between" style={{ alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.3 }}>{word.word}</div>
          {(word.reading !== word.word || (showRomaji && word.romaji)) && (
            <div className="muted" style={{ fontSize: 14 }}>
              {[word.reading !== word.word ? word.reading : '', showRomaji ? word.romaji : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>
        <button className="speak" onClick={() => onSpeak(word.reading)} type="button">
          <IconVolume size={15} /> 朗读
        </button>
      </div>
      <div className="word-meta">
        <span className="tag red">{word.level}</span>
      </div>
      <PosTags pos={word.pos} />
      <div style={{ marginTop: 10 }}>
        <GlossList items={word.zh} />
      </div>
      {word.en?.length > 0 && <div className="tiny" style={{ marginTop: 6 }}>EN: {word.en.join('; ')}</div>}
      {word.example && (
        <div className="card tight" style={{ marginTop: 12, marginBottom: 0 }}>
          <div style={{ fontSize: 15 }}>
            <Ruby pieces={word.example.ruby} text={word.example.ja} mark={word.word} />
          </div>
          <div className="tiny" style={{ marginTop: 4 }}>
            {word.example.en}
          </div>
        </div>
      )}
      {note?.trim() && (
        <div className="note-card">
          <div className="tiny">我的笔记</div>
          <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{note}</div>
        </div>
      )}
      {confusions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="tiny" style={{ marginBottom: 6 }}>
            易混淆词{onOpenWord ? ' · 点按查看' : ''}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {confusions.map((c) =>
              onOpenWord ? (
                <button key={c.id} className="chip" type="button" onClick={() => onOpenWord(c.id)}>
                  {c.word}
                  {c.reading !== c.word && <span className="muted">{c.reading}</span>}
                </button>
              ) : (
                <span key={c.id} className="chip">
                  {c.word}
                  {c.reading !== c.word && <span className="muted">{c.reading}</span>}
                </span>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}
