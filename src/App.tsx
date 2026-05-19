import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ProgressInfo,
  WorkerInbound,
  WorkerOutbound,
  WorkerStatus,
} from './types';
import type { PIIRegion } from './schema';
import './App.css';

type LoadProgress = {
  file?: string;
  loaded?: number;
  total?: number;
  progress?: number;
};

type DebugState = {
  regions: PIIRegion[];
  rawModelText: string;
  ocrText: string;
  modelParseError?: string;
  ocrError?: string;
};

const EMPTY_DEBUG: DebugState = {
  regions: [],
  rawModelText: '',
  ocrText: '',
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
  return `${v.toFixed(1)} ${units[i]}`;
}

function App() {
  const workerRef = useRef<Worker | null>(null);
  const [status, setStatus] = useState<WorkerStatus | 'idle'>('idle');
  const [loadProgress, setLoadProgress] = useState<LoadProgress>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [tokens, setTokens] = useState('');
  const [debug, setDebug] = useState<DebugState>(EMPTY_DEBUG);
  const [dragOver, setDragOver] = useState(false);
  const generationIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(
      new URL('./worker/gemma.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data;
      if (msg.type === 'STATUS') {
        setStatus(msg.status);
        if (msg.status === 'loading' && msg.progress) {
          setLoadProgress((prev) => mergeProgress(prev, msg.progress!));
        }
        if (msg.status === 'ready') {
          setLoadProgress((prev) => ({ ...prev, progress: 100 }));
        }
        if (msg.status === 'error') {
          setErrorMsg(msg.message);
        }
        if (msg.status === 'generating') {
          setTokens((prev) => prev + msg.token);
        }
      } else if (msg.type === 'REGIONS') {
        setDebug({
          regions: msg.regions,
          rawModelText: msg.rawModelText,
          ocrText: msg.ocrText,
          modelParseError: msg.modelParseError,
          ocrError: msg.ocrError,
        });
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const isLoading = status === 'loading';
  const isReady = status === 'ready';
  const isGenerating = status === 'generating';
  const canGenerate = isReady && bitmap !== null;

  const progressPct = useMemo(() => {
    if (status === 'ready') return 100;
    if (typeof loadProgress.progress === 'number') {
      return Math.min(100, Math.max(0, loadProgress.progress));
    }
    if (loadProgress.loaded && loadProgress.total) {
      return Math.min(100, (loadProgress.loaded / loadProgress.total) * 100);
    }
    return 0;
  }, [status, loadProgress]);

  const handleLoad = () => {
    setErrorMsg(null);
    setStatus('loading');
    const msg: WorkerInbound = { type: 'LOAD' };
    workerRef.current?.postMessage(msg);
  };

  const handleGenerate = () => {
    if (!bitmap || !workerRef.current) return;
    setErrorMsg(null);
    setTokens('');
    setDebug(EMPTY_DEBUG);
    setStatus('generating');
    const id = String(++generationIdRef.current);
    createImageBitmap(bitmap).then((clone) => {
      const msg: WorkerInbound = {
        type: 'GENERATE',
        id,
        image: clone,
        prompt,
        maxNewTokens: 1024,
      };
      workerRef.current!.postMessage(msg, [clone]);
    });
  };

  const acceptFile = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please drop an image file.');
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    const bmp = await createImageBitmap(file);
    setBitmap(bmp);
    setPreviewUrl(url);
    setDebug(EMPTY_DEBUG);
    setTokens('');
  };

  const handleResetCache = async () => {
    if (
      !confirm(
        'Clear cached Gemma 4 model and reload? The next load will re-download ~500 MB.',
      )
    ) {
      return;
    }
    try {
      if (typeof caches !== 'undefined') {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      const dbs = await indexedDB.databases?.();
      if (dbs) {
        await Promise.all(
          dbs
            .filter((d) => !!d.name)
            .map(
              (d) =>
                new Promise<void>((resolve) => {
                  const req = indexedDB.deleteDatabase(d.name!);
                  req.onsuccess = () => resolve();
                  req.onerror = () => resolve();
                  req.onblocked = () => resolve();
                }),
            ),
        );
      }
    } finally {
      location.reload();
    }
  };

  return (
    <main className="app">
      <header className="header">
        <h1>Vanish · Phase 2</h1>
        <p className="subtitle">
          Gemma 4 E2B + regex backstop + OCR, all in this tab. Nothing leaves your device.
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <button
            type="button"
            onClick={handleLoad}
            disabled={isLoading || isReady || isGenerating}
          >
            {isReady
              ? 'Model ready'
              : isLoading
                ? 'Loading…'
                : 'Load model'}
          </button>
          <button type="button" className="ghost" onClick={handleResetCache}>
            Reset model cache
          </button>
        </div>
        <div className="progress" aria-hidden={!isLoading && !isReady}>
          <div className="bar" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="progress-text">
          {isLoading && (
            <>
              {loadProgress.file ? <code>{loadProgress.file}</code> : 'Initializing…'}{' '}
              {loadProgress.loaded != null && loadProgress.total != null && (
                <span>
                  {formatBytes(loadProgress.loaded)} / {formatBytes(loadProgress.total)}
                </span>
              )}
              <span> · {progressPct.toFixed(1)}%</span>
            </>
          )}
          {isReady && <span>Ready.</span>}
          {isGenerating && <span>Generating…</span>}
        </div>
      </section>

      <section
        className={`dropzone ${dragOver ? 'over' : ''} ${previewUrl ? 'has-image' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0] ?? null;
          void acceptFile(file);
        }}
      >
        {previewUrl ? (
          <img className="preview" src={previewUrl} alt="dropped" />
        ) : (
          <div className="hint">
            Drag an image here, or
            <label className="file-label">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void acceptFile(e.target.files?.[0] ?? null)}
              />
              <span>choose a file</span>
            </label>
          </div>
        )}
      </section>

      <section className="panel">
        <label className="label" htmlFor="prompt">
          Optional additional instructions (leave blank for default PII detection)
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="e.g. Also flag any pricing or revenue figures."
        />
        <div className="row">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
          >
            {isGenerating ? 'Generating…' : 'Detect PII'}
          </button>
        </div>
      </section>

      <section className="debug">
        <div className="debug-pane">
          <div className="debug-head">
            Raw model output
            {debug.modelParseError && (
              <span className="debug-tag bad">parse error</span>
            )}
          </div>
          <pre className="debug-body">
            {debug.rawModelText || (isGenerating ? tokens || '…' : '—')}
          </pre>
          {debug.modelParseError && (
            <div className="debug-error">{debug.modelParseError}</div>
          )}
        </div>

        <div className="debug-pane">
          <div className="debug-head">
            OCR text
            {debug.ocrError && <span className="debug-tag bad">ocr error</span>}
          </div>
          <pre className="debug-body">{debug.ocrText || '—'}</pre>
          {debug.ocrError && <div className="debug-error">{debug.ocrError}</div>}
        </div>

        <div className="debug-pane">
          <div className="debug-head">
            Merged regions
            <span className="debug-tag">{debug.regions.length}</span>
          </div>
          <pre className="debug-body">
            {debug.regions.length === 0
              ? '—'
              : JSON.stringify(debug.regions, null, 2)}
          </pre>
        </div>
      </section>

      {errorMsg && (
        <section className="panel error">
          <strong>Error:</strong> {errorMsg}
        </section>
      )}
    </main>
  );
}

function mergeProgress(prev: LoadProgress, info: ProgressInfo): LoadProgress {
  return {
    file: info.file ?? info.name ?? prev.file,
    loaded: info.loaded ?? prev.loaded,
    total: info.total ?? prev.total,
    progress: info.progress ?? prev.progress,
  };
}

export default App;
