type Props = {
  active: boolean;
};

// 1px lime indicator that sits at the very top of the top bar. Resting: 30%
// opacity, 2px wide, top-left corner. Active during inference: CSS-animated
// to ~60% width across the top, ~1.2s loop.
export function ScanLineIndicator({ active }: Props) {
  if (active) {
    return (
      <div
        className="absolute top-0 left-3 h-px bg-lime animate-scanline"
        style={{ width: '2px' }}
        aria-hidden
      />
    );
  }
  return (
    <div
      className="absolute top-0 left-3 h-px bg-lime"
      style={{ width: '2px', opacity: 0.3 }}
      aria-hidden
    />
  );
}
