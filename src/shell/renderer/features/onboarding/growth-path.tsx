const PATH_D = 'M36 384 C 170 350, 260 300, 350 220 C 440 140, 520 90, 612 52';

const PATH_NODES: ReadonlyArray<{ cx: number; cy: number }> = [
  { cx: 80, cy: 366 },
  { cx: 236, cy: 306 },
  { cx: 392, cy: 192 },
  { cx: 546, cy: 96 },
] as const;

/**
 * Abstract growth trajectory behind the characters: one soft dashed curve
 * rising from bottom-left (birth) to top-right (teen), with small node dots
 * marking stages along the way. Pure SVG, decorative only.
 */
export function GrowthPath() {
  return (
    <svg
      viewBox="0 0 640 420"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="parentos-onboarding-enter-path pointer-events-none absolute inset-0 z-0 h-full w-full"
    >
      <defs>
        <linearGradient id="parentosGrowthStroke" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#7db8f2" stopOpacity="0.6" />
          <stop offset="55%" stopColor="#8ba3f0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <path
        d={PATH_D}
        fill="none"
        stroke="url(#parentosGrowthStroke)"
        strokeWidth="2.2"
        strokeDasharray="2 9"
        strokeLinecap="round"
      />
      {PATH_NODES.map((node) => (
        <g key={`${node.cx}-${node.cy}`}>
          <circle cx={node.cx} cy={node.cy} r="7" fill="#8ba3f0" opacity="0.18" />
          <circle cx={node.cx} cy={node.cy} r="3" fill="#ffffff" stroke="#8ba3f0" strokeWidth="1.4" />
        </g>
      ))}
    </svg>
  );
}
