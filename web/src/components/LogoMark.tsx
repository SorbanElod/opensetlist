// The wordmark's icon: three staff lines with an eighth note in the accent
// green — a hand-drawn inline SVG, not a colored tile wrapping an icon font
// glyph (issue #56). Scales via the size prop; viewBox is 32x32.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden
      role="presentation"
    >
      {/* staff lines */}
      {[12, 17, 22].map((y) => (
        <line
          key={y}
          x1="3"
          y1={y}
          x2="29"
          y2={y}
          stroke="var(--color-border-strong)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      ))}
      {/* eighth note: head on the bottom line, stem up, flag curving right */}
      <ellipse
        cx="19"
        cy="22"
        rx="3.2"
        ry="2.4"
        fill="var(--color-accent)"
        transform="rotate(-18 19 22)"
      />
      <rect
        x="21.4"
        y="8"
        width="1.8"
        height="14"
        rx="0.9"
        fill="var(--color-accent)"
      />
      <path
        d="M23.2 8 C26.5 9 27 12.5 25 14.5"
        stroke="var(--color-accent)"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
