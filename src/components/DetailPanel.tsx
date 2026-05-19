import { useEffect, useState } from 'react';
import { CATEGORY_META } from '../lib/categories';
import type { ClientRegion } from '../lib/regions';
import { LockIcon, PencilIcon, TrashIcon } from '../lib/icons';

type Props = {
  region: ClientRegion;
  index: number;
  onChangeReplacement: (id: string, replacement: string) => void;
  onDelete: (id: string) => void;
  onLockToggle: (id: string) => void;
};

export function DetailPanel({ region, index, onChangeReplacement, onDelete, onLockToggle }: Props) {
  const meta = CATEGORY_META[region.category];
  const [draft, setDraft] = useState(region.replacement);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(region.replacement);
    setEditing(false);
  }, [region.id, region.replacement]);

  const commit = () => {
    if (draft !== region.replacement) onChangeReplacement(region.id, draft);
    setEditing(false);
  };

  return (
    <aside className="bg-surface-1 flex flex-col min-h-0 border-l border-border">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <span
          className="w-2.5 h-2.5 rounded-sm"
          style={{ background: meta.cssVar }}
          aria-hidden
        />
        <span className="font-sans text-[14px] font-medium leading-none tracking-body text-text-1">
          {meta.label}
        </span>
        <span className="ml-auto font-mono text-[11px] leading-none text-text-3">
          region · {String(index + 1).padStart(2, '0')}
        </span>
      </div>

      <div className="px-5 py-[18px] pb-5 flex flex-col gap-[18px]">
        <div>
          <div className="font-sans text-[10px] font-medium uppercase tracking-[0.10em] text-text-3 mb-2">
            Detected text
          </div>
          <div className="bg-bg border border-border px-[11px] py-[9px] font-mono text-[13px] font-medium leading-[1.3] text-text-1 rounded-[3px] break-all">
            {region.text || <span className="text-text-3">(no OCR text)</span>}
          </div>
        </div>

        <div>
          <div className="font-sans text-[10px] font-medium uppercase tracking-[0.10em] text-text-3 mb-2">
            Replacement
          </div>
          {editing ? (
            <input
              autoFocus
              className="w-full bg-bg border border-border px-[11px] py-[9px] font-mono text-[13px] font-medium leading-[1.3] text-text-1 rounded-[3px] outline-none focus:border-lime"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commit();
                }
                if (e.key === 'Escape') {
                  setDraft(region.replacement);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="w-full bg-bg border border-border px-[11px] py-[9px] font-mono text-[13px] font-medium leading-[1.3] text-text-1 rounded-[3px] flex items-center justify-between text-left cursor-text"
            >
              <span>{region.replacement}</span>
              <span className="text-text-3"><PencilIcon /></span>
            </button>
          )}
        </div>

        <div>
          <div className="font-sans text-[10px] font-medium uppercase tracking-[0.10em] text-text-3 mb-2">
            Confidence
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 h-1 bg-border rounded-[2px] overflow-hidden relative">
              <div
                className="absolute left-0 top-0 h-full"
                style={{ width: `${region.confidence * 100}%`, background: meta.cssVar }}
              />
            </div>
            <div className="font-mono text-[12px] font-medium leading-none text-text-1 min-w-[36px] text-right">
              {region.confidence.toFixed(2)}
            </div>
          </div>
        </div>

        <div>
          <div className="font-sans text-[10px] font-medium uppercase tracking-[0.10em] text-text-3 mb-2">
            Source
          </div>
          <div className="flex gap-1.5">
            <span
              className={`h-[22px] px-2.5 rounded-[3px] border font-sans text-[11px] font-medium leading-[22px] inline-flex items-center gap-1.5 ${
                region.source === 'model'
                  ? 'border-lime text-text-1 bg-[rgba(198,244,50,0.08)]'
                  : 'border-border-strong text-text-2 bg-transparent'
              }`}
            >
              <span
                className={`w-[5px] h-[5px] rounded-full ${
                  region.source === 'model' ? 'bg-lime' : 'bg-text-3'
                }`}
                aria-hidden
              />
              Model
            </span>
            <span
              className={`h-[22px] px-2.5 rounded-[3px] border font-sans text-[11px] font-medium leading-[22px] inline-flex items-center gap-1.5 ${
                region.source === 'regex'
                  ? 'border-lime text-text-1 bg-[rgba(198,244,50,0.08)]'
                  : 'border-border-strong text-text-2 bg-transparent'
              }`}
            >
              <span
                className={`w-[5px] h-[5px] rounded-full ${
                  region.source === 'regex' ? 'bg-lime' : 'bg-text-3'
                }`}
                aria-hidden
              />
              Regex
            </span>
          </div>
        </div>

        <div className="h-px bg-border my-0.5" />

        <div className="flex gap-5">
          <button
            type="button"
            onClick={() => onDelete(region.id)}
            className="bg-transparent border-0 p-0 text-text-2 hover:text-text-1 font-sans text-[13px] font-medium leading-none inline-flex items-center gap-1.5 cursor-pointer"
          >
            <TrashIcon />
            Delete region
          </button>
          <button
            type="button"
            onClick={() => onLockToggle(region.id)}
            aria-pressed={!!region.locked}
            className={`bg-transparent border-0 p-0 font-sans text-[13px] font-medium leading-none inline-flex items-center gap-1.5 cursor-pointer ${
              region.locked ? 'text-lime' : 'text-text-2 hover:text-text-1'
            }`}
          >
            <LockIcon />
            {region.locked ? 'Locked' : 'Lock'}
          </button>
        </div>
      </div>
    </aside>
  );
}

export function DetailPanelEmpty() {
  return (
    <aside className="bg-surface-1 flex flex-col min-h-0 border-l border-border">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border">
        <span className="w-2.5 h-2.5 rounded-sm bg-border-strong" aria-hidden />
        <span className="font-sans text-[14px] font-medium leading-none text-text-3">
          No selection
        </span>
      </div>
    </aside>
  );
}
