import { Music } from 'lucide-react';

// The wordmark's icon: one green rounded square with a note — from the
// design mockup. Pure inline SVG via lucide, no image asset needed.
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 9,
        background: 'var(--color-accent)',
        color: 'var(--color-on-accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Music size={size * 0.55} strokeWidth={2.5} />
    </div>
  );
}
