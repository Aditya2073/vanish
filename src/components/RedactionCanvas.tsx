import { useMemo } from 'react';
import type { PIICategory } from '../schema';
import type { ClientRegion } from '../lib/regions';
import { CATEGORY_META } from '../lib/categories';

type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  regions: ClientRegion[];
  selectedId: string | null;
  hoveredCategory: PIICategory | null;
  enabled: Record<PIICategory, boolean>;
  onSelect: (id: string | null) => void;
  onHoverBox: (cat: PIICategory | null) => void;
  onCreateAt?: (xNorm: number, yNorm: number) => void;
};

function Crosshair({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const cls: Record<typeof pos, string> = {
    tl: 'top-3.5 left-3.5',
    tr: 'top-3.5 right-3.5',
    bl: 'bottom-3.5 left-3.5',
    br: 'bottom-3.5 right-3.5',
  };
  const horizPos: Record<typeof pos, string> = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  };
  const vertPos: Record<typeof pos, string> = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  };
  return (
    <div className={`absolute w-3 h-3 pointer-events-none opacity-40 ${cls[pos]}`} aria-hidden>
      <span className={`absolute w-3 h-px bg-lime ${horizPos[pos]}`} />
      <span className={`absolute w-px h-3 bg-lime ${vertPos[pos]}`} />
    </div>
  );
}

export function RedactionCanvas({
  imageUrl,
  imageWidth,
  imageHeight,
  regions,
  selectedId,
  hoveredCategory,
  enabled,
  onSelect,
  onHoverBox,
  onCreateAt,
}: Props) {
  const visibleRegions = useMemo(
    () => regions.filter((r) => enabled[r.category]),
    [regions, enabled],
  );

  // Floating labels: always for the selected region, plus the two highest-confidence
  // non-selected ones.
  const labeledIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedId) ids.add(selectedId);
    [...visibleRegions]
      .filter((r) => r.id !== selectedId)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 2)
      .forEach((r) => ids.add(r.id));
    return ids;
  }, [visibleRegions, selectedId]);

  const handleStageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onCreateAt) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onCreateAt(Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)));
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden grid-canvas flex items-center justify-center"
      onClick={(e) => {
        // Click on empty canvas deselects
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <Crosshair pos="tl" />
      <Crosshair pos="tr" />
      <Crosshair pos="bl" />
      <Crosshair pos="br" />

      <div
        className="relative"
        style={{
          // Stage shrinks to fit the canvas-wrap while preserving aspect.
          aspectRatio: `${imageWidth} / ${imageHeight}`,
          maxWidth: 'min(100%, 1100px)',
          maxHeight: '100%',
        }}
        onDoubleClick={handleStageDoubleClick}
      >
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          className="block w-full h-full select-none pointer-events-none"
        />

        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
        >
          {visibleRegions.map((r) => {
            const meta = CATEGORY_META[r.category];
            const dimmed = hoveredCategory != null && hoveredCategory !== r.category;
            const opacity = dimmed ? 0.2 : 1;
            return (
              <g
                key={r.id}
                style={{ opacity }}
                onMouseEnter={() => onHoverBox(r.category)}
                onMouseLeave={() => onHoverBox(null)}
                onContextMenu={(e) => {
                  // Right-click handler is upstream; we just stop the native menu so
                  // the parent can replace the region with a delete action.
                  e.preventDefault();
                }}
              >
                <rect
                  x={r.bbox.x}
                  y={r.bbox.y}
                  width={r.bbox.w}
                  height={r.bbox.h}
                  fill={meta.cssVar}
                  fillOpacity={0.12}
                  stroke={meta.cssVar}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(r.id);
                  }}
                  aria-label={`${meta.label} region, confidence ${r.confidence.toFixed(2)}`}
                  role="button"
                />
                {r.id === selectedId && (
                  <rect
                    x={r.bbox.x}
                    y={r.bbox.y}
                    width={r.bbox.w}
                    height={r.bbox.h}
                    fill="none"
                    stroke="var(--text-1)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                    pointerEvents="none"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Floating labels in a separate HTML layer so they don't stretch */}
        <div className="absolute inset-0 pointer-events-none">
          {visibleRegions.map((r) => {
            if (!labeledIds.has(r.id)) return null;
            const meta = CATEGORY_META[r.category];
            const dimmed = hoveredCategory != null && hoveredCategory !== r.category;
            return (
              <div
                key={r.id}
                className="absolute"
                style={{
                  left: `${r.bbox.x * 100}%`,
                  top: `${r.bbox.y * 100}%`,
                  transform: 'translateY(-100%)',
                  opacity: dimmed ? 0.2 : 1,
                }}
              >
                <div
                  className="inline-flex items-center gap-1.5 h-[18px] px-1.5 bg-bg font-mono text-[10px] font-medium leading-[18px] text-text-3 border whitespace-nowrap"
                  style={{ borderColor: meta.cssVar, marginLeft: '-2px' }}
                >
                  <span className="text-text-1">{meta.shortLabel.toLowerCase()}</span>
                  <span className="text-text-3">· {r.confidence.toFixed(2)}</span>
                </div>
              </div>
            );
          })}

          {/* Selection handles */}
          {visibleRegions.map((r) => {
            if (r.id !== selectedId) return null;
            const positions: Array<{ key: string; style: React.CSSProperties; cursor: string }> = [
              {
                key: 'tl',
                style: {
                  left: `${r.bbox.x * 100}%`,
                  top: `${r.bbox.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                },
                cursor: 'nwse-resize',
              },
              {
                key: 'tr',
                style: {
                  left: `${(r.bbox.x + r.bbox.w) * 100}%`,
                  top: `${r.bbox.y * 100}%`,
                  transform: 'translate(-50%, -50%)',
                },
                cursor: 'nesw-resize',
              },
              {
                key: 'bl',
                style: {
                  left: `${r.bbox.x * 100}%`,
                  top: `${(r.bbox.y + r.bbox.h) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                },
                cursor: 'nesw-resize',
              },
              {
                key: 'br',
                style: {
                  left: `${(r.bbox.x + r.bbox.w) * 100}%`,
                  top: `${(r.bbox.y + r.bbox.h) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                },
                cursor: 'nwse-resize',
              },
            ];
            return positions.map((p) => (
              <div
                key={`${r.id}-${p.key}`}
                className="absolute w-[5px] h-[5px] bg-lime border border-text-1 pointer-events-none"
                style={p.style}
                aria-hidden
              />
            ));
          })}
        </div>
      </div>
    </div>
  );
}
