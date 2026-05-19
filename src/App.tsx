import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProgressInfo, WorkerInbound, WorkerOutbound, WorkerStatus } from './types';
import type { PIICategory } from './schema';
import { CATEGORY_META, CATEGORY_ORDER } from './lib/categories';
import { toClientRegions } from './lib/regions';
import { copyImageBlobToClipboard, downloadBlob, renderRedacted } from './lib/export';
import { useRedaction } from './hooks/useRedaction';
import { useTheme } from './hooks/useTheme';
import { TopBar } from './components/TopBar';
import { CategoryRail } from './components/CategoryRail';
import { RedactionCanvas } from './components/RedactionCanvas';
import { DetailPanel, DetailPanelEmpty } from './components/DetailPanel';
import { ExportBar } from './components/ExportBar';
import { Dropzone, type SampleEntry } from './components/Dropzone';
import { HowItWorksCard } from './components/HowItWorksCard';
import { ModelLoadingState } from './components/ModelLoadingState';
import type { RedactionMode } from './components/RedactionModeToggle';

const SAMPLES: SampleEntry[] = [
  { label: 'crm.png', src: '/samples/crm.png' },
  { label: 'slack.png', src: '/samples/slack.png' },
  { label: 'terminal.png', src: '/samples/terminal.png' },
  { label: 'billing.png', src: '/samples/billing.png' },
  { label: 'clean.png', src: '/samples/clean.png' },
];

const EMPTY_ENABLED: Record<PIICategory, boolean> = CATEGORY_ORDER.reduce(
  (acc, cat) => {
    acc[cat] = true;
    return acc;
  },
  {} as Record<PIICategory, boolean>,
);

type LoadProgress = {
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
  bytesPerSecond?: number;
  etaSeconds?: number;
};

function App() {
  const { theme, toggle: toggleTheme } = useTheme();

  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<WorkerStatus | 'idle'>('idle');
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [imageDims, setImageDims] = useState<{ w: number; h: number } | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredCategory, setHoveredCategory] = useState<PIICategory | null>(null);
  const [enabled, setEnabled] = useState<Record<PIICategory, boolean>>(EMPTY_ENABLED);
  const [mode, setMode] = useState<RedactionMode>('solid');

  const region = useRedaction();
  const generationIdRef = useRef(0);
  const pendingGenerationRef = useRef(false);
  const loadStartedAtRef = useRef<number>(0);

  // ───── Worker bootstrap ─────────────────────────────────────────────────
  useEffect(() => {
    const w = new Worker(
      new URL('./worker/gemma.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = w;

    w.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;
      if (msg.type === 'STATUS') {
        setStatus(msg.status);
        if (msg.status === 'loading' && msg.progress) {
          setLoadProgress((prev) => mergeProgress(prev, msg.progress!, loadStartedAtRef.current));
        }
        if (msg.status === 'ready') {
          setLoadProgress((prev) => ({ ...prev, progress: 100 }));
        }
        if (msg.status === 'error') {
          setErrorMsg(msg.message);
          pendingGenerationRef.current = false;
        }
      } else if (msg.type === 'REGIONS') {
        region.set(toClientRegions(msg.regions));
      }
    };

    return () => {
      w.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the model becomes ready and we have a pending generation, run it.
  useEffect(() => {
    if (status === 'ready' && pendingGenerationRef.current && bitmap && workerRef.current) {
      pendingGenerationRef.current = false;
      triggerGenerate(bitmap);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, bitmap]);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  // ───── Image intake ─────────────────────────────────────────────────────
  const intakeFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    const url = URL.createObjectURL(file);
    const bmp = await createImageBitmap(file);
    setBitmap((prev) => {
      prev?.close?.();
      return bmp;
    });
    setImageUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setImageName(file.name);
    setImageDims({ w: bmp.width, h: bmp.height });
    setSelectedId(null);
    region.set([]);
    autoStart(bmp);
  }, [region]);

  const intakeFromSrc = useCallback(async (src: string) => {
    setErrorMsg(null);
    const resp = await fetch(src);
    const blob = await resp.blob();
    const name = src.split('/').pop() ?? 'sample.png';
    const file = new File([blob], name, { type: blob.type || 'image/png' });
    await intakeFile(file);
  }, [intakeFile]);

  const autoStart = (bmp: ImageBitmap) => {
    if (status === 'ready') {
      triggerGenerate(bmp);
    } else if (status === 'idle' || status === 'error') {
      pendingGenerationRef.current = true;
      triggerLoad();
    } else if (status === 'loading') {
      pendingGenerationRef.current = true;
    } else if (status === 'generating') {
      // The current run won't see this bitmap; queue it.
      pendingGenerationRef.current = true;
    }
  };

  const triggerLoad = () => {
    setStatus('loading');
    loadStartedAtRef.current = Date.now();
    const msg: WorkerInbound = { type: 'LOAD' };
    workerRef.current?.postMessage(msg);
  };

  const triggerGenerate = (bmp: ImageBitmap) => {
    if (!workerRef.current) return;
    setStatus('generating');
    const id = String(++generationIdRef.current);
    createImageBitmap(bmp).then((clone) => {
      const msg: WorkerInbound = {
        type: 'GENERATE',
        id,
        image: clone,
        prompt: '',
        maxNewTokens: 1024,
      };
      workerRef.current!.postMessage(msg, [clone]);
    });
  };

  // ───── Derived state ────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Partial<Record<PIICategory, number>> = {};
    for (const r of region.regions) c[r.category] = (c[r.category] ?? 0) + 1;
    return c;
  }, [region.regions]);

  const visibleRegions = useMemo(
    () => region.regions.filter((r) => enabled[r.category]),
    [region.regions, enabled],
  );

  const selectedRegion = useMemo(
    () => region.regions.find((r) => r.id === selectedId) ?? null,
    [region.regions, selectedId],
  );
  const selectedIndex = useMemo(
    () => (selectedRegion ? region.regions.indexOf(selectedRegion) : -1),
    [region.regions, selectedRegion],
  );

  // ───── Toolbar handlers ─────────────────────────────────────────────────
  const onCopy = useCallback(async () => {
    if (!bitmap) return;
    try {
      const blob = await renderRedacted({ mode, bitmap, regions: visibleRegions });
      await copyImageBlobToClipboard(blob);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [bitmap, mode, visibleRegions]);

  const onDownload = useCallback(async () => {
    if (!bitmap) return;
    try {
      const blob = await renderRedacted({ mode, bitmap, regions: visibleRegions });
      const base = imageName.replace(/\.[^.]+$/, '');
      downloadBlob(blob, `${base || 'vanish'}-redacted.png`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  }, [bitmap, mode, visibleRegions, imageName]);

  // ───── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        region.undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        region.redo();
      } else if (k === 'c' && bitmap) {
        // Don't intercept regular text copy inside inputs.
        if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
        e.preventDefault();
        void onCopy();
      } else if (k === 'd' && bitmap) {
        e.preventDefault();
        void onDownload();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bitmap, onCopy, onDownload, region]);

  // ───── UI ───────────────────────────────────────────────────────────────
  const isLanding = !bitmap;
  const isModelLoading = status === 'loading';
  const showLoadingInCanvas = isModelLoading && !bitmap;

  return (
    <div className="min-h-screen bg-page-bg md:flex md:items-center md:justify-center md:p-10">
      <div
        role="application"
        aria-label="Vanish PII redaction editor"
        className="bg-bg border-0 md:border md:border-border w-full md:max-w-[1440px] h-screen md:h-[900px] grid"
        style={{ gridTemplateRows: '48px 1fr 56px' }}
      >
        <TopBar
          fileName={imageName || undefined}
          fileSize={imageDims ? `${imageDims.w} × ${imageDims.h}` : undefined}
          status={status}
          theme={theme}
          onThemeToggle={toggleTheme}
        />

        <div className="grid min-h-0 md:[grid-template-columns:220px_1fr_280px] [grid-template-columns:1fr] [grid-template-rows:auto_1fr] md:[grid-template-rows:1fr]">
          <div className="hidden md:block">
            <CategoryRail
              counts={counts}
              enabled={enabled}
              totalRegions={region.regions.length}
              activeCategory={selectedRegion?.category ?? null}
              hoveredCategory={hoveredCategory}
              onToggle={(cat) => setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }))}
              onHover={setHoveredCategory}
              onAddManual={() => {
                if (!imageDims) return;
                region.add({
                  id: `m-${Date.now().toString(36)}`,
                  source: 'manual',
                  category: 'free_text_secret',
                  bbox: { x: 0.4, y: 0.4, w: 0.2, h: 0.06 },
                  text: '',
                  confidence: 1,
                  replacement: '[redacted]',
                });
              }}
              isEmpty={region.regions.length === 0}
            />
          </div>
          {/* Mobile: horizontal category chip strip below the top bar */}
          {region.regions.length > 0 && (
            <div className="md:hidden h-11 border-b border-border flex items-center gap-1.5 px-4 overflow-x-auto bg-bg">
              {CATEGORY_ORDER.filter((c) => (counts[c] ?? 0) > 0).map((cat) => {
                const meta = CATEGORY_META[cat];
                const on = enabled[cat];
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setEnabled((prev) => ({ ...prev, [cat]: !prev[cat] }))}
                    aria-pressed={on}
                    style={{ color: meta.cssVar }}
                    className={`inline-flex items-center gap-2 h-7 px-2.5 border rounded-full flex-none ${
                      on ? 'border-border-strong bg-surface-2' : 'border-border bg-surface-1 opacity-50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-sm" style={{ background: 'currentColor' }} aria-hidden />
                    <span className="font-sans text-[12px] font-medium leading-none text-text-1">{meta.shortLabel}</span>
                    <span className="font-mono text-[11px] leading-none text-text-2">{counts[cat]}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="bg-surface-1 relative overflow-hidden border-r border-border">
            {isLanding ? (
              <Dropzone samples={SAMPLES} onFile={intakeFile} onSample={intakeFromSrc} />
            ) : showLoadingInCanvas ? (
              <ModelLoadingState
                percent={loadProgress.progress ?? 0}
                loadedBytes={loadProgress.loaded}
                totalBytes={loadProgress.total}
                bytesPerSecond={loadProgress.bytesPerSecond}
                etaSeconds={loadProgress.etaSeconds}
              />
            ) : isModelLoading ? (
              <ModelLoadingState
                percent={loadProgress.progress ?? 0}
                loadedBytes={loadProgress.loaded}
                totalBytes={loadProgress.total}
                bytesPerSecond={loadProgress.bytesPerSecond}
                etaSeconds={loadProgress.etaSeconds}
              />
            ) : imageUrl && imageDims ? (
              <RedactionCanvas
                imageUrl={imageUrl}
                imageWidth={imageDims.w}
                imageHeight={imageDims.h}
                regions={visibleRegions}
                selectedId={selectedId}
                hoveredCategory={hoveredCategory}
                enabled={enabled}
                onSelect={setSelectedId}
                onHoverBox={setHoveredCategory}
                onBboxChange={(id, bbox) => region.update(id, { bbox })}
                onDelete={(id) => {
                  region.remove(id);
                  if (selectedId === id) setSelectedId(null);
                }}
                onCreateAt={(xNorm, yNorm, category) => {
                  const w = 0.18;
                  const h = 0.05;
                  const x = Math.max(0, Math.min(1 - w, xNorm - w / 2));
                  const y = Math.max(0, Math.min(1 - h, yNorm - h / 2));
                  const id = `m-${Date.now().toString(36)}`;
                  region.add({
                    id,
                    source: 'manual',
                    category,
                    bbox: { x, y, w, h },
                    text: '',
                    confidence: 1,
                    replacement: `[${category}]`,
                  });
                  setSelectedId(id);
                }}
              />
            ) : null}
          </div>

          <div className="hidden md:block">
            {isLanding ? (
              <HowItWorksCard />
            ) : selectedRegion ? (
              <DetailPanel
                region={selectedRegion}
                index={selectedIndex}
                onChangeReplacement={(id, replacement) => region.update(id, { replacement })}
                onDelete={(id) => {
                  region.remove(id);
                  if (selectedId === id) setSelectedId(null);
                }}
                onLockToggle={(id) => {
                  const target = region.regions.find((r) => r.id === id);
                  if (target) region.update(id, { locked: !target.locked });
                }}
              />
            ) : (
              <DetailPanelEmpty />
            )}
          </div>
          {/* Mobile: detail slides up from the bottom as a sheet */}
          {selectedRegion && (
            <div className="md:hidden fixed left-0 right-0 bottom-14 z-40 bg-surface-1 border-t border-border max-h-[60vh] overflow-y-auto">
              <div className="w-6 h-1 rounded-full bg-border-strong mx-auto my-3" aria-hidden />
              <DetailPanel
                region={selectedRegion}
                index={selectedIndex}
                onChangeReplacement={(id, replacement) => region.update(id, { replacement })}
                onDelete={(id) => {
                  region.remove(id);
                  if (selectedId === id) setSelectedId(null);
                }}
                onLockToggle={(id) => {
                  const target = region.regions.find((r) => r.id === id);
                  if (target) region.update(id, { locked: !target.locked });
                }}
              />
            </div>
          )}
        </div>

        <ExportBar
          mode={mode}
          onMode={setMode}
          onCopy={onCopy}
          onDownload={onDownload}
          canExport={!!bitmap}
        />
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="fixed bottom-6 right-6 max-w-[420px] bg-surface-2 border border-cat-key text-text-1 px-4 py-3 font-mono text-[12px]"
        >
          <strong className="text-cat-key">Error:</strong> {errorMsg}
        </div>
      )}
    </div>
  );
}

function mergeProgress(
  prev: LoadProgress,
  info: ProgressInfo,
  startedAt: number,
): LoadProgress {
  const next: LoadProgress = {
    file: info.file ?? info.name ?? prev.file,
    loaded: info.loaded ?? prev.loaded,
    total: info.total ?? prev.total,
    progress: info.progress ?? prev.progress,
  };
  if (next.loaded != null && next.total != null && startedAt > 0) {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed > 1) {
      const bps = next.loaded / elapsed;
      next.bytesPerSecond = bps;
      const remaining = next.total - next.loaded;
      next.etaSeconds = remaining > 0 && bps > 0 ? remaining / bps : 0;
    }
  }
  return next;
}

export default App;
