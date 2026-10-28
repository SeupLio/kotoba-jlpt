/**
 * 界面图标：全部自绘的线性 SVG，统一 24×24 视框、1.8px 描边、圆角端点。
 *
 * 为什么不用图标库 / emoji：
 *  - 图标库会引入额外依赖与授权问题；
 *  - emoji 由系统字体渲染，在 Android、Windows、iOS 上形态与配色完全不一致，
 *    会和「和纸 + 朱红 + 墨色」的设计语言冲突。
 * 自绘只依赖 currentColor，跟随主题与按钮状态变化，成本最低。
 */

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Base({ size = 20, className, strokeWidth = 1.8, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 今日：屋顶 + 门 */
export const IconHome = (p: IconProps) => (
  <Base {...p}>
    <path d="M3.5 10.5 12 3.6l8.5 6.9" />
    <path d="M5.6 9.8V20h12.8V9.8" />
    <path d="M9.7 20v-5.2h4.6V20" />
  </Base>
);

/** 词库：摊开的书 */
export const IconBook = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 6.6C10.4 5.3 8.3 4.8 5.2 5v13c3.1-.2 5.2.3 6.8 1.6 1.6-1.3 3.7-1.8 6.8-1.6V5c-3.1-.2-5.2.3-6.8 1.6Z" />
    <path d="M12 6.6v13" />
  </Base>
);

/** 统计：柱状图 */
export const IconChart = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 20h16" />
    <path d="M7.2 20v-5.6" />
    <path d="M11.6 20V9.2" />
    <path d="M16 20v-8" />
  </Base>
);

/** 设置：滑杆 */
export const IconSliders = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 7h9" />
    <path d="M17 7h3" />
    <path d="M4 17h3" />
    <path d="M11 17h9" />
    <circle cx="15" cy="7" r="2.1" />
    <circle cx="9" cy="17" r="2.1" />
  </Base>
);

/** 朗读：喇叭 + 声波 */
export const IconVolume = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.6 9.4h3.1L12 5.8v12.4l-4.3-3.6H4.6z" />
    <path d="M15.4 9.2a4 4 0 0 1 0 5.6" />
    <path d="M17.8 6.8a7.4 7.4 0 0 1 0 10.4" />
  </Base>
);

/** 关闭 */
export const IconClose = (p: IconProps) => (
  <Base {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6 6 18" />
  </Base>
);

/** 正确 */
export const IconCheck = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.8 12.6l4.5 4.6L19.2 6.6" />
  </Base>
);

/** 错误 */
export const IconCross = (p: IconProps) => (
  <Base {...p}>
    <path d="M6.4 6.4l11.2 11.2" />
    <path d="M17.6 6.4 6.4 17.6" />
  </Base>
);

/** 完成：圆圈 + 勾，用于学习结束页 */
export const IconDone = ({ size = 48, className }: IconProps) => (
  <Base size={size} className={className} strokeWidth={1.4}>
    <circle cx="12" cy="12" r="9.2" />
    <path d="M7.8 12.4l2.9 2.9 5.6-5.9" />
  </Base>
);

/** 撤销：向左回转箭头 */
export const IconUndo = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.6 9.2h9.2a5.2 5.2 0 0 1 0 10.4H8.4" />
    <path d="M8.2 4.8 3.6 9.2l4.6 4.4" />
  </Base>
);

/** 看答案：眼睛 */
export const IconEye = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.8 12s3.4-6.2 9.2-6.2S21.2 12 21.2 12s-3.4 6.2-9.2 6.2S2.8 12 2.8 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Base>
);

/** 搜索 */
export const IconSearch = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10.8" cy="10.8" r="6.2" />
    <path d="M15.4 15.4 20 20" />
  </Base>
);

/** 语法：笔 */
export const IconPen = (p: IconProps) => (
  <Base {...p}>
    <path d="M4.2 19.8 5.5 15.4 16.1 4.8a2 2 0 0 1 2.8 0l.3.3a2 2 0 0 1 0 2.8L8.6 18.5 4.2 19.8Z" />
    <path d="M14.6 6.4l3 3" />
    <path d="M4.2 19.8 8.6 18.5" />
  </Base>
);

/** 模考：带时钟的试卷 */
export const IconExam = (p: IconProps) => (
  <Base {...p}>
    <path d="M9 4.5H7.2A1.7 1.7 0 0 0 5.5 6.2v13.1a1.7 1.7 0 0 0 1.7 1.7h9.6a1.7 1.7 0 0 0 1.7-1.7V6.2a1.7 1.7 0 0 0-1.7-1.7H15" />
    <rect x="9" y="3" width="6" height="3.2" rx="1" />
    <circle cx="12" cy="13" r="3.6" />
    <path d="M12 11.3V13l1.2.8" />
  </Base>
);
