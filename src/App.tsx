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
  const [regions, setRegions] = useState<PIIRegion[]>([]);
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
      } else if (msg.type === 'REGIONS') {
        setRegions(msg.regions);
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
    setRegions([]);
    setStatus('generating');
    const id = String(++generationIdRef.current);
    createImageBitmap(bitmap).then((clone) => {
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
    setRegions([]);
  };

  return (
    <main className="app">
      <header className="header">
        <h1>Vanish</h1>
        <p className="subtitle">Phase 3 build in progress.</p>
      </header>

      <section className="panel">
        <button type="button" onClick={handleLoad} disabled={isLoading || isReady || isGenerating}>
          {isReady ? 'Model ready' : isLoading ? 'Loading…' : 'Load model'}
        </button>
        <div className="progress" aria-hidden={!isLoading && !isReady}>
          <div className="bar" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="progress-text">
          {isLoading && loadProgress.file && (
            <code>{loadProgress.file}</code>
          )}
          {isLoading && loadProgress.loaded != null && loadProgress.total != null && (
            <span>
              {' '}{formatBytes(loadProgress.loaded)} / {formatBytes(loadProgress.total)} · {progressPct.toFixed(1)}%
            </span>
          )}
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
          void acceptFile(e.dataTransfer.files?.[0] ?? null);
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

      <button type="button" onClick={handleGenerate} disabled={!canGenerate || isGenerating}>
        {isGenerating ? 'Detecting…' : 'Detect PII'}
      </button>

      {regions.length > 0 && (
        <section className="panel">
          {regions.length} region(s) detected.
        </section>
      )}

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
