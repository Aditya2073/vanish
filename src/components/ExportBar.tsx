import { CopyIcon, DownloadIcon } from '../lib/icons';
import { RedactionModeToggle, type RedactionMode } from './RedactionModeToggle';

type Props = {
  mode: RedactionMode;
  onMode: (m: RedactionMode) => void;
  onCopy: () => void;
  onDownload: () => void;
  canExport: boolean;
};

export function ExportBar({ mode, onMode, onCopy, onDownload, canExport }: Props) {
  return (
    <footer className="border-t border-border h-14 flex items-center justify-between px-5 bg-bg">
      <RedactionModeToggle value={mode} onChange={onMode} />
      <div className="flex gap-2.5">
        <button
          type="button"
          onClick={onCopy}
          disabled={!canExport}
          className="h-9 px-3.5 rounded border border-border-strong bg-surface-2 text-text-1 font-sans text-[14px] font-medium leading-none tracking-body inline-flex items-center gap-2.5 cursor-pointer disabled:text-text-3 disabled:border-border disabled:cursor-not-allowed"
        >
          <CopyIcon />
          Copy
          <span className="font-mono text-[12px] leading-none text-text-3">⌘C</span>
        </button>
        <button
          type="button"
          onClick={onDownload}
          disabled={!canExport}
          className="h-9 px-3.5 rounded bg-lime text-lime-ink border border-lime font-sans text-[14px] font-medium leading-none tracking-body inline-flex items-center gap-2.5 cursor-pointer disabled:bg-surface-2 disabled:text-text-3 disabled:border-border disabled:cursor-not-allowed"
        >
          <DownloadIcon />
          Download
          <span className="font-mono text-[12px] leading-none" style={{ color: 'rgba(10,11,12,0.55)' }}>⌘D</span>
        </button>
      </div>
    </footer>
  );
}
