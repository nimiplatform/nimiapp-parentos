/**
 * ParentosAiMascotButton — ParentOS 专属 AI 吉祥物按钮（圆形小精灵）。
 *
 * 一个渐变圆球小人：白色眼睛会眨眼，待机时轻轻上下浮动，AI 生成中
 * 会左右摇摆并转动眼珠“思考”。纯 SVG + CSS keyframes（无动画依赖），
 * 动效类定义在 styles.css 的 `parentos-ai-mascot-*` 区段，并遵循
 * prefers-reduced-motion。颜色全部取自 nimi 主题 token，深浅色主题自适应。
 *
 * ParentosAiMascotStatic 是非交互形态：用于“暂无数据”等 AI 尚不可用、
 * 但仍想展示小精灵存在感的位置（装饰性，aria-hidden）。
 */
import { useId } from 'react';

function MascotSvg({ size }: { size: number }) {
  const gradientId = `parentos-ai-mascot-body-${useId()}`;
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      className="parentos-ai-mascot-float"
    >
      <defs>
        <radialGradient id={gradientId} cx="35%" cy="28%" r="85%">
          <stop offset="0%" style={{ stopColor: 'color-mix(in srgb, var(--nimi-action-primary-bg) 55%, white)' }} />
          <stop offset="55%" style={{ stopColor: 'var(--nimi-action-primary-bg)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--nimi-action-primary-bg-hover)' }} />
        </radialGradient>
      </defs>
      {/* 圆球身体 */}
      <circle cx="32" cy="32" r="30" fill={`url(#${gradientId})`} />
      {/* 顶部高光，让球体更圆润 */}
      <ellipse cx="24" cy="15" rx="14" ry="7.5" fill="white" opacity="0.22" />
      {/* 两只眼睛：白色胶囊，眨眼/思考动效由 CSS 控制 */}
      <rect className="parentos-ai-mascot-eye" x="19.5" y="21" width="9" height="15" rx="4.5" fill="white" />
      <rect className="parentos-ai-mascot-eye" x="35.5" y="21" width="9" height="15" rx="4.5" fill="white" />
      {/* 微笑 */}
      <path
        d="M25 42 Q32 47.5 39 42"
        fill="none"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}

interface ParentosAiMascotButtonProps {
  /** AI 是否正在生成（切换到“思考”动效并禁止重复点击）。 */
  thinking: boolean;
  onClick: () => void;
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
