interface RingProps {
  pct: number;
  size?: number;
}

// SVG-кольцо прогресса с золотым акцентом.
export function Ring({ pct, size = 76 }: RingProps) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sd)" strokeWidth="6" opacity="0.5" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="ring-val">{pct}%</span>
    </div>
  );
}
