export type RedactionMode = 'solid' | 'blur' | 'replace';

type Props = {
  value: RedactionMode;
  onChange: (mode: RedactionMode) => void;
};

const OPTIONS: { mode: RedactionMode; label: string }[] = [
  { mode: 'solid', label: 'Solid' },
  { mode: 'blur', label: 'Blur' },
  { mode: 'replace', label: 'Replace' },
];

export function RedactionModeToggle({ value, onChange }: Props) {
  return (
    <div
      className="inline-flex border border-border-strong rounded overflow-hidden h-8"
      role="radiogroup"
      aria-label="Redaction style"
    >
      {OPTIONS.map((opt, i) => {
        const active = opt.mode === value;
        return (
          <button
            key={opt.mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.mode)}
            className={`h-full px-3.5 font-sans text-[13px] font-medium leading-none tracking-body cursor-pointer bg-transparent ${
              i < OPTIONS.length - 1 ? 'border-r border-border-strong' : ''
            } ${active ? 'bg-lime text-lime-ink' : 'text-text-2 hover:text-text-1'}`}
            style={active ? { background: 'var(--lime)' } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
