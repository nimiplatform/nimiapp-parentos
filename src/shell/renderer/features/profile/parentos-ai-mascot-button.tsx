/**
 * ParentosAiMascotButton — ParentOS 专属 AI 吉祥物按钮（圆形小精灵）。
 *
 * 一颗中性气质的透明玻璃球：球体内流动着 ParentOS logo 的三个颜色
 * （薄荷绿 #7DF4C7 / 蓝 #53B3F7 / 紫 #977AF9），只有两只白色竖胶囊眼睛，
 * 无嘴无表情。待机时轻轻上下浮动、周期性眨眼，眼珠还会不时左右、
 * 斜向（左上/右上）打量四周；AI 生成中会左右摇摆并转动眼珠“思考”。纯 SVG + CSS
 * keyframes（无动画依赖），动效类定义在 styles.css 的
 * `parentos-ai-mascot-*` 区段，并遵循 prefers-reduced-motion。
 *
 * ParentosAiMascotStatic 是非交互形态：用于“暂无数据”等 AI 尚不可用、
 * 但仍想展示小精灵存在感的位置（装饰性，aria-hidden）。
 */
import { useId, type MouseEvent } from 'react';

function MascotSvg({ size }: { size: number }) {
  const uid = useId();
  const washGradientId = `parentos-ai-mascot-wash-${uid}`;
  const glowWhiteId = `parentos-ai-mascot-glow-white-${uid}`;
  const glowMintId = `parentos-ai-mascot-glow-mint-${uid}`;
  const sphereClipId = `parentos-ai-mascot-clip-${uid}`;
  const softenId = `parentos-ai-mascot-soften-${uid}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="parentos-ai-mascot-float"
    >
      <defs>
        {/* 整球冷色底罩：铺满整个球体，保证远看是一颗完整的球 */}
        <radialGradient id={washGradientId} cx="40%" cy="34%" r="78%">
          <stop offset="0%" stopColor="#EAF6FF" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#D5E6FF" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#C6BCF2" stopOpacity="0.72" />
        </radialGradient>
        {/* 片状高光：中心实、边缘化开的白色光斑 */}
        <radialGradient id={glowWhiteId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={glowMintId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#A9F5DB" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#A9F5DB" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#A9F5DB" stopOpacity="0" />
        </radialGradient>
        <clipPath id={sphereClipId}>
          <circle cx="32" cy="32" r="28.5" />
        </clipPath>
        {/* 让球内色块像液体一样柔和相融；clip 在 filter 之后生效，球体边缘保持清晰 */}
        <filter id={softenId}>
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>
      {/* 球体底色：整球铺满，不留“透明缺口” */}
      <circle cx="32" cy="32" r="28.5" fill={`url(#${washGradientId})`} />
      {/* 球内铺满流动的 logo 色：左上薄荷绿、左侧蓝、右下紫，色块放大到互相重叠、覆盖整个球体 */}
      <g clipPath={`url(#${sphereClipId})`} filter={`url(#${softenId})`}>
        <ellipse cx="19" cy="25" rx="21" ry="19" fill="#53B3F7" opacity="0.9" transform="rotate(-20 19 25)" />
        <ellipse cx="25" cy="10" rx="17" ry="12" fill="#7DF4C7" opacity="0.85" transform="rotate(-10 25 10)" />
        <ellipse cx="45" cy="43" rx="21" ry="18" fill="#977AF9" opacity="0.9" transform="rotate(20 45 43)" />
        <ellipse cx="41" cy="26" rx="13" ry="16" fill="#7C8CF8" opacity="0.5" transform="rotate(10 41 26)" />
        <ellipse cx="14" cy="46" rx="13" ry="11" fill="#6FE3C8" opacity="0.6" transform="rotate(15 14 46)" />
        {/* 眼睛后方一团乳白光泽，模拟玻璃的奶白透感 */}
        <ellipse cx="29" cy="24" rx="13" ry="9" fill="white" opacity="0.55" />
      </g>
      {/* 片状玻璃反光：左上一片白色光斑 + 右下一小片薄荷反弹光 */}
      <ellipse cx="20.5" cy="13.5" rx="12" ry="7" fill={`url(#${glowWhiteId})`} transform="rotate(-25 20.5 13.5)" />
      <ellipse cx="47" cy="49" rx="8" ry="5" fill={`url(#${glowMintId})`} transform="rotate(35 47 49)" />
      {/* 球体轮廓：浅色底上靠淡紫描边定义边缘，深色底上白亮边强化玻璃感 */}
      <circle cx="32" cy="32" r="28.4" fill="none" stroke="#A9B8F2" strokeWidth="1" opacity="0.55" />
      <circle cx="32" cy="32" r="28" fill="none" stroke="white" strokeWidth="1.1" opacity="0.4" />
      {/* 两只眼睛：白色竖胶囊；外层 g 控制“看向”（上下左右转眼），内层 rect 控制眨眼 */}
      <g className="parentos-ai-mascot-eye-look">
        <rect className="parentos-ai-mascot-eye" x="20" y="23" width="8" height="14" rx="4" fill="white" />
      </g>
      <g className="parentos-ai-mascot-eye-look">
        <rect className="parentos-ai-mascot-eye" x="36" y="23" width="8" height="14" rx="4" fill="white" />
      </g>
    </svg>
  );
}

interface ParentosAiMascotButtonProps {
  /** AI 是否正在生成（切换到“思考”动效并禁止重复点击）。 */
  thinking: boolean;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  /** 辅助功能标签与悬浮提示，例如 i18nText('AISummary.regenerate')。 */
  label: string;
  /** 圆形按钮的像素尺寸，默认 36。 */
  size?: number;
}

export function ParentosAiMascotButton(props: ParentosAiMascotButtonProps) {
  const size = props.size ?? 36;
  return (
    <button
      type="button"
      className={`parentos-ai-mascot-button${props.thinking ? ' is-thinking' : ''}`}
      style={{ width: size, height: size }}
      onClick={props.onClick}
      disabled={props.thinking}
      aria-label={props.label}
      title={props.label}
    >
      <MascotSvg size={size} />
    </button>
  );
}

/** 非交互吉祥物：保留待机浮动与眨眼动效，但不可点击、不响应 hover。 */
export function ParentosAiMascotStatic({ size = 28 }: { size?: number }) {
  return (
    <span className="parentos-ai-mascot-static" style={{ width: size, height: size }} aria-hidden="true">
      <MascotSvg size={size} />
    </span>
  );
}
