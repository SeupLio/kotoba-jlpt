/** 品牌标识：墨色底、朱红朝日、和纸摊开的书。
 *  几何结构自绘，不依赖字体，缩到 24px 仍能辨认；网页、PWA 与 Android 共用同一套形状。 */
export function LogoMark({
  size = 36,
  className = '',
  title = '言葉 Kotoba',
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  return (
    <svg
      className={`logo-mark${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
    >
      <rect width="512" height="512" rx="118" fill="#24221f" />
      <circle cx="256" cy="198" r="106" fill="#c0392b" />
      <path
        d="M82 258 C154 232 212 242 256 280 C300 242 358 232 430 258 L430 376 C358 350 300 360 256 398 C212 360 154 350 82 376 Z"
        fill="#f7f4ee"
      />
      <path d="M256 280 V398" stroke="#24221f" strokeWidth="15" strokeLinecap="round" />
      <g stroke="#24221f" strokeWidth="7" strokeLinecap="round" opacity=".22">
        <path d="M126 306 H206" />
        <path d="M126 330 H196" />
        <path d="M126 354 H184" />
        <path d="M306 306 H386" />
        <path d="M316 330 H386" />
        <path d="M328 354 H386" />
      </g>
    </svg>
  );
}

/** 横排标识：图形 + 中英文字标，用于顶栏与引导页 */
export function BrandLockup({ size = 36, sub = 'JLPT 词汇训练器' }: { size?: number; sub?: string }) {
  return (
    <span className="brand-lockup">
      <LogoMark size={size} />
      <span className="brand-words">
        <span className="brand-jp">言葉</span>
        <span className="brand-en">Kotoba</span>
        {sub && <span className="brand-sub">{sub}</span>}
      </span>
    </span>
  );
}
