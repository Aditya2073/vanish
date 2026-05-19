export function HowItWorksCard() {
  return (
    <div className="mx-[18px] mt-[18px] p-[18px] bg-surface-1 border border-border rounded">
      <h3 className="font-sans text-[13px] font-medium leading-none tracking-body text-text-1 m-0 mb-4">
        How this works
      </h3>
      <ol className="list-none p-0 m-0 flex flex-col gap-3.5" style={{ counterReset: 'how' }}>
        {[
          'Your screenshot stays on this device.',
          'Gemma 4 finds the PII.',
          'You redact, export, done.',
        ].map((line, i) => (
          <li
            key={i}
            className="font-sans text-[13px] leading-[1.4] text-text-2 grid gap-2"
            style={{ gridTemplateColumns: '22px 1fr', counterIncrement: 'how' }}
          >
            <span className="font-mono text-[12px] leading-[1.4] font-medium text-text-3">
              {i + 1}.
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
