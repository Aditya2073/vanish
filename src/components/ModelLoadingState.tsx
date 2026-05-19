type Props = {
  percent: number;          // 0..100
  loadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
};

function formatBytes(n?: number): string {
  if (!n || !Number.isFinite(n)) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatEta(s?: number): string {
  if (!s || !Number.isFinite(s)) return '';
  if (s < 60) return `~${Math.round(s)} s remaining`;
  return `~${Math.round(s / 60)} min remaining`;
}

// 48px lime ring on a #2A2E33 track. Stroke width 2.  C = 2πr at r=22 ≈ 138.23.
const R = 22;
const C = 2 * Math.PI * R;

export function ModelLoadingState({
  percent,
  loadedBytes,
  totalBytes,
  bytesPerSecond,
  etaSeconds,
}: Props) {
  const safe = Math.max(0, Math.min(100, percent));
  const dashOffset = C - (C * safe) / 100;

  const metaParts = [
    loadedBytes != null && totalBytes != null
      ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
      : null,
    bytesPerSecond ? `${formatBytes(bytesPerSecond)}/s` : null,
    formatEta(etaSeconds),
  ].filter(Boolean);

  return (
    <div className="absolute inset-0 grid-canvas flex flex-col items-center justify-center p-8">
      <div className="w-12 h-12 relative mb-[22px]" aria-hidden>
        <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
          <circle cx="24" cy="24" r={R} fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="24"
            cy="24"
            r={R}
            fill="none"
            stroke="var(--lime)"
            strokeWidth="2"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dashoffset 120ms linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-medium leading-none text-text-1">
          {Math.round(safe)}%
        </div>
      </div>
      <div className="font-sans text-[14px] font-medium leading-none tracking-body text-text-1 mb-2.5">
        Downloading Gemma 4 E2B
      </div>
      <div className="font-mono text-[12px] leading-none text-text-3 mb-[18px] min-h-[14px]">
        {metaParts.join(' · ')}
      </div>
      <div className="font-sans text-[12px] leading-[1.4] text-text-3 max-w-[360px] text-center">
        One-time download. Cached for next time. Nothing else leaves your device.
      </div>
    </div>
  );
}
