import type { PIICategory } from '../schema';
import { CATEGORY_META, CATEGORY_ORDER } from '../lib/categories';
import { PlusIcon } from '../lib/icons';

type Props = {
  counts: Partial<Record<PIICategory, number>>;
  enabled: Record<PIICategory, boolean>;
  totalRegions: number;
  activeCategory: PIICategory | null;
  hoveredCategory: PIICategory | null;
  onToggle: (cat: PIICategory) => void;
  onHover: (cat: PIICategory | null) => void;
  onAddManual: () => void;
  isEmpty: boolean;
};

export function CategoryRail({
  counts,
  enabled,
  totalRegions,
  activeCategory,
  hoveredCategory,
  onToggle,
  onHover,
  onAddManual,
  isEmpty,
}: Props) {
  const visibleCats = CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0);

  return (
    <aside className="border-r border-border bg-surface-1 flex flex-col min-h-0">
      <div className="px-3.5 pt-4 pb-2.5">
        <div className="font-sans text-[11px] font-medium leading-none tracking-[0.08em] uppercase text-text-3 px-1.5 pt-1.5 pb-3">
          Detected
        </div>
        {isEmpty ? (
          <div className="px-2 py-2 font-mono text-[12px] leading-[1.4] text-text-3">
            No regions yet.<br />Drop a screenshot to begin.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5 px-1.5">
            {visibleCats.map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = counts[cat] ?? 0;
              const isActive = activeCategory === cat;
              const isHovered = hoveredCategory === cat;
              const on = enabled[cat];
              return (
                <div
                  key={cat}
                  className={`grid items-center gap-2.5 h-9 px-2 rounded ${
                    isActive || isHovered ? 'bg-surface-2' : ''
                  }`}
                  style={{ gridTemplateColumns: '14px 1fr auto auto', color: meta.cssVar }}
                  onMouseEnter={() => onHover(cat)}
                  onMouseLeave={() => onHover(null)}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: 'currentColor' }}
                    aria-hidden
                  />
                  <span className="font-sans text-[13px] font-medium leading-none text-text-1">
                    {meta.label}
                  </span>
                  <span
                    className={`font-mono text-[11px] font-medium leading-none text-text-2 border border-border-strong px-1.5 py-[3px] rounded-full min-w-[22px] text-center ${
                      isActive ? 'bg-bg' : 'bg-surface-2'
                    }`}
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={`Toggle ${meta.label} regions`}
                    onClick={() => onToggle(cat)}
                    className={`relative w-7 h-4 rounded-full transition-colors ${
                      on ? 'bg-lime' : 'bg-border-strong'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-3 h-3 rounded-full transition-[left] ${
                        on ? 'left-3.5 bg-lime-ink' : 'left-0.5 bg-text-1'
                      }`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {!isEmpty && <div className="h-px bg-border mx-3.5 mt-3.5" />}

      {!isEmpty && (
        <button
          type="button"
          onClick={onAddManual}
          className="flex items-center gap-2 px-5 py-3 text-text-2 hover:text-text-1 font-sans text-[13px] font-medium leading-none bg-transparent border-0 cursor-pointer text-left"
        >
          <PlusIcon />
          <span>Add region manually</span>
        </button>
      )}

      <div className="mt-auto px-5 py-3.5 font-mono text-[11px] leading-[1.3] text-text-3 border-t border-border">
        {totalRegions === 0
          ? '0 regions'
          : `${totalRegions} region${totalRegions === 1 ? '' : 's'} detected`}
      </div>
    </aside>
  );
}
