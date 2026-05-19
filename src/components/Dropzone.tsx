import { useEffect, useState } from 'react';
import { ArrowRightIcon, ImagePlusIcon } from '../lib/icons';

export type SampleEntry = {
  label: string;
  src: string;
};

type Props = {
  samples: SampleEntry[];
  onFile: (file: File) => void;
  onSample: (src: string) => void;
};

const ACCEPTED_PREFIX = 'image/';

export function Dropzone({ samples, onFile, onSample }: Props) {
  const [over, setOver] = useState(false);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith(ACCEPTED_PREFIX),
      );
      const file = item?.getAsFile();
      if (file) {
        e.preventDefault();
        onFile(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [onFile]);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type.startsWith(ACCEPTED_PREFIX)) onFile(f);
  };

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center p-8">
      <label
        className={`relative w-full h-full flex flex-col items-center justify-center p-8 border-2 border-dashed rounded cursor-pointer transition-colors ${
          over ? 'border-lime' : 'border-border-strong'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <span className="text-text-3 mb-4">
          <ImagePlusIcon size={24} />
        </span>
        <div className="font-sans text-[20px] font-medium leading-[1.2] tracking-head text-text-1 mb-1.5">
          Drop a screenshot to redact it
        </div>
        <div className="font-sans text-[13px] leading-[1.3] text-text-2 mb-4">
          Paste with <span className="font-mono text-text-1">⌘V</span>, drag in, or click to choose a file.
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            const first = samples[0];
            if (first) onSample(first.src);
          }}
          className="bg-lime text-lime-ink border-0 h-8 px-3.5 rounded font-sans text-[13px] font-medium tracking-body inline-flex items-center gap-1.5 cursor-pointer"
        >
          Try a sample
          <ArrowRightIcon />
        </button>

        <div className="mt-7 flex gap-2">
          {samples.map((s) => (
            <button
              type="button"
              key={s.label}
              onClick={(e) => {
                e.preventDefault();
                onSample(s.src);
              }}
              className="flex flex-col items-center gap-2 bg-transparent border-0 p-0 cursor-pointer group"
              aria-label={`Try ${s.label}`}
            >
              <div className="w-24 h-16 border border-border bg-surface-2 overflow-hidden relative transition-transform group-hover:scale-[1.03]">
                <img
                  src={s.src}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="font-mono text-[11px] leading-none text-text-3">{s.label}</div>
            </button>
          ))}
        </div>
      </label>
    </div>
  );
}
