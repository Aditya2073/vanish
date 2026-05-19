import { useEffect, useMemo, useRef, useState } from 'react';
import type { Bbox, PIICategory } from '../schema';
import type { ClientRegion } from '../lib/regions';
import { CATEGORY_META, CATEGORY_ORDER } from '../lib/categories';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type DragKind = { kind: 'move' } | { kind: 'resize'; corner: Corner };

type DragState = {
  id: string;
  kind: DragKind;
  startBbox: Bbox;
  startClientX: number;
  startClientY: number;
  stageW: number;
  stageH: number;
};

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
  onBboxChange: (id: string, bbox: Bbox) => void;
  onDelete: (id: string) => void;
  onCreateAt: (xNorm: number, yNorm: number, category: PIICategory) => void;
};

function Crosshair({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const cls = {
    tl: 'top-3.5 left-3.5',
    tr: 'top-3.5 right-3.5',
    bl: 'bottom-3.5 left-3.5',
    br: 'bottom-3.5 right-3.5',
  }[pos];
  const horiz = {
    tl: 'top-0 left-0',
    tr: 'top-0 right-0',
    bl: 'bottom-0 left-0',
    br: 'bottom-0 right-0',
  }[pos];
  return (
    <div className={`absolute w-3 h-3 pointer-events-none opacity-40 ${cls}`} aria-hidden>
      <span className={`absolute w-3 h-px bg-lime ${horiz}`} />
      <span className={`absolute w-px h-3 bg-lime ${horiz}`} />
    </div>
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function applyDrag(start: Bbox, drag: DragState, clientX: number, clientY: number): Bbox {
  const dx = (clientX - drag.startClientX) / drag.stageW;
  const dy = (clientY - drag.startClientY) / drag.stageH;
  if (drag.kind.kind === 'move') {
    const x = clamp01(start.x + dx);
    const y = clamp01(start.y + dy);
    const w = Math.min(start.w, 1 - x);
    const h = Math.min(start.h, 1 - y);
    return { x, y, w, h };
  }
  // resize
  let x1 = start.x;
  let y1 = start.y;
  let x2 = start.x + start.w;
  let y2 = start.y + start.h;
  switch (drag.kind.corner) {
    case 'tl': x1 += dx; y1 += dy; break;
    case 'tr': x2 += dx; y1 += dy; break;
    case 'bl': x1 += dx; y2 += dy; break;
    case 'br': x2 += dx; y2 += dy; break;
  }
  if (x2 < x1) [x1, x2] = [x2, x1];
  if (y2 < y1) [y1, y2] = [y2, y1];
  x1 = clamp01(x1); y1 = clamp01(y1);
  x2 = clamp01(x2); y2 = clamp01(y2);
  return { x: x1, y: y1, w: Math.max(0.005, x2 - x1), h: Math.max(0.005, y2 - y1) };
}

function CategoryPopover({
  onPick,
  onClose,
  x,
  y,
}: {
  onPick: (cat: PIICategory) => void;
  onClose: () => void;
  x: number;
  y: number;
}) {
  return (
    <>
      <div className="absolute inset-0 z-20" onClick={onClose} aria-hidden />
      <div
        className="absolute z-30 bg-surface-2 border border-border min-w-[180px] py-1 max-h-[320px] overflow-y-auto"
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
        role="menu"
      >
        <div className="px-3 py-2 font-sans text-[10px] uppercase tracking-[0.10em] text-text-3 border-b border-border">
          New region
        </div>
        {CATEGORY_ORDER.map((cat) => {
          const meta = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              type="button"
              role="menuitem"
              onClick={() => onPick(cat)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-left bg-transparent border-0 cursor-pointer text-text-1 hover:bg-surface-1"
            >
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: meta.cssVar }}
                aria-hidden
              />
              <span className="font-sans text-[13px] font-medium leading-none">
                {meta.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
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
  onBboxChange,
  onDelete,
  onCreateAt,
}: Props) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null);

  const visibleRegions = useMemo(
    () => regions.filter((r) => enabled[r.category]),
    [regions, enabled],
  );

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

  // Pointer-move / pointer-up handlers live on window during a drag so movement
  // outside the stage still tracks correctly.
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const region = regions.find((r) => r.id === drag.id);
      if (!region || region.locked) return;
      const next = applyDrag(drag.startBbox, drag, e.clientX, e.clientY);
      onBboxChange(drag.id, next);
    };
    const onUp = () => setDrag(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, regions, onBboxChange]);

  const startDrag = (id: string, kind: DragKind, e: React.PointerEvent) => {
    const region = regions.find((r) => r.id === id);
    if (!region || region.locked) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    e.stopPropagation();
    e.preventDefault();
    setDrag({
      id,
      kind,
      startBbox: { ...region.bbox },
      startClientX: e.clientX,
      startClientY: e.clientY,
      stageW: rect.width,
      stageH: rect.height,
    });
  };

  const handleStageDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    if (e.target !== stage && (e.target as HTMLElement).tagName !== 'IMG') return;
    const rect = stage.getBoundingClientRect();
    const x = clamp01((e.clientX - rect.left) / rect.width);
    const y = clamp01((e.clientY - rect.top) / rect.height);
    setPopover({ x, y });
  };

  return (
    <div
      className="relative w-full h-full overflow-hidden grid-canvas flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onSelect(null);
          setPopover(null);
        }
      }}
    >
      <Crosshair pos="tl" />
      <Crosshair pos="tr" />
      <Crosshair pos="bl" />
      <Crosshair pos="br" />

      <div
        ref={stageRef}
        className="relative"
        style={{
          aspectRatio: `${imageWidth} / ${imageHeight}`,
          maxWidth: 'min(100%, 1100px)',
          maxHeight: '100%',
        }}
        onDoubleClick={handleStageDoubleClick}
      >
        <img
          src={imageUrl}
          alt="Loaded screenshot — bounding boxes overlay detected PII regions"
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
            const isSelected = r.id === selectedId;
            return (
              <g key={r.id} style={{ opacity: dimmed ? 0.2 : 1 }}>
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
                  style={{ cursor: r.locked ? 'not-allowed' : 'crosshair', pointerEvents: 'all' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${meta.label} region, confidence ${r.confidence.toFixed(2)}${
                    r.locked ? ', locked' : ''
                  }`}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    onSelect(r.id);
                    startDrag(r.id, { kind: 'move' }, e);
                  }}
                  onMouseEnter={() => onHoverBox(r.category)}
                  onMouseLeave={() => onHoverBox(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    onDelete(r.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                      e.preventDefault();
                      onDelete(r.id);
                    }
                  }}
                />
                {isSelected && (
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

        {/* HTML layer for labels and handles */}
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

          {/* Resize handles on the selected box */}
          {visibleRegions.map((r) => {
            if (r.id !== selectedId || r.locked) return null;
            const positions: Array<{ key: Corner; left: number; top: number; cursor: string }> = [
              { key: 'tl', left: r.bbox.x,            top: r.bbox.y,            cursor: 'nwse-resize' },
              { key: 'tr', left: r.bbox.x + r.bbox.w, top: r.bbox.y,            cursor: 'nesw-resize' },
              { key: 'bl', left: r.bbox.x,            top: r.bbox.y + r.bbox.h, cursor: 'nesw-resize' },
              { key: 'br', left: r.bbox.x + r.bbox.w, top: r.bbox.y + r.bbox.h, cursor: 'nwse-resize' },
            ];
            return positions.map((p) => (
              <div
                key={`${r.id}-${p.key}`}
                className="absolute w-[5px] h-[5px] bg-lime border border-text-1"
                style={{
                  left: `${p.left * 100}%`,
                  top: `${p.top * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  cursor: p.cursor,
                  pointerEvents: 'auto',
                  touchAction: 'none',
                }}
                onPointerDown={(e) => startDrag(r.id, { kind: 'resize', corner: p.key }, e)}
                aria-hidden
              />
            ));
          })}
        </div>

        {popover && (
          <CategoryPopover
            x={popover.x}
            y={popover.y}
            onClose={() => setPopover(null)}
            onPick={(cat) => {
              const w = 0.18;
              const h = 0.05;
              const x = clamp01(popover.x - w / 2);
              const y = clamp01(popover.y - h / 2);
              onCreateAt(x + w / 2, y + h / 2, cat);
              setPopover(null);
              // Caller wires this into region.add + then setSelectedId on its side.
              void cat;
              return { x, y, w, h };
            }}
          />
        )}
      </div>
    </div>
  );
}
