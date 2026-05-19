import type { WorkerStatus } from '../types';
import { MoonIcon, SunIcon } from '../lib/icons';
import { ScanLineIndicator } from './ScanLineIndicator';

type Props = {
  fileName?: string;
  fileSize?: string;
  status: WorkerStatus | 'idle';
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
};

function StatusPill({ status }: { status: WorkerStatus | 'idle' }) {
  const labelByStatus: Record<WorkerStatus | 'idle', string> = {
    idle: 'Idle',
    loading: 'Loading',
    ready: 'Ready',
    generating: 'Detecting',
    error: 'Error',
  };
  const dotByStatus: Record<WorkerStatus | 'idle', string> = {
    idle: 'bg-text-3',
    loading: 'bg-lime animate-pulse',
    ready: 'bg-lime',
    generating: 'bg-lime animate-pulse',
    error: 'bg-cat-key',
  };

  return (
    <div
      className="inline-flex items-center gap-2.5 h-7 pl-2.5 pr-3 border border-border-strong bg-surface-2 rounded-full"
      role="status"
      aria-live="polite"
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${dotByStatus[status]}`}
        style={{ boxShadow: '0 0 0 3px rgba(198,244,50,0.10)' }}
        aria-hidden
      />
      <span className="font-sans text-[12px] font-medium leading-none text-text-1">
        {labelByStatus[status]}
      </span>
      <span className="font-mono text-[11px] leading-none text-text-2">Gemma 4 E2B</span>
    </div>
  );
}

export function TopBar({ fileName, fileSize, status, theme, onThemeToggle }: Props) {
  return (
    <header className="h-12 border-b border-border grid grid-cols-[220px_1fr_auto] items-center px-5 bg-bg relative">
      <ScanLineIndicator active={status === 'loading' || status === 'generating'} />
      <div className="font-mono font-semibold text-[22px] leading-none tracking-[-0.04em] text-text-1">
        Va<span className="text-text-3 font-medium">n</span>ish
      </div>
      <div className="font-mono text-[12px] text-text-2 flex items-center gap-2.5 pl-1">
        {fileName ? (
          <>
            <span>{fileName}</span>
            <span aria-hidden className="text-text-2">·</span>
            <span className="text-text-2">{fileSize ?? ''}</span>
          </>
        ) : (
          <span className="text-text-2">No file loaded</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <StatusPill status={status} />
        <button
          type="button"
          onClick={onThemeToggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="text-text-2 hover:text-text-1 flex items-center justify-center w-7 h-7"
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <a className="font-sans text-[12px] font-medium text-text-2 hover:text-text-1 no-underline" href="#/privacy">
          Privacy
        </a>
      </div>
    </header>
  );
}
