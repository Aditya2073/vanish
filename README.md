# Vanish

**Drop a screenshot. PII disappears. Nothing leaves your device.**

Vanish is a browser-only redaction tool that finds personally identifiable information in screenshots and lets you redact it in one click. The model — [Gemma 4 E2B](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) — runs locally on your GPU via WebGPU. There is no server. The network tab is empty after the model finishes downloading.

Submission for the [dev.to Gemma 4 Challenge — Build With Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06).

## Why

Sharing a screenshot of a CRM, a Slack thread, or a terminal almost always leaks something — a customer email, a bearer token, an internal account number. Cloud redaction tools want you to upload the very thing you are trying to protect. Vanish flips that: the screenshot stays in the tab, the model runs on your hardware, and the redacted PNG is the only thing that ever exists outside.

## What it does

- **Detects 12 categories** of PII: email, phone, person name, street address, account number, balance, API key, JWT, IP address, customer ID, face, and free-text secret.
- **Two detection passes that merge**: Gemma 4 returns spatial bounding boxes for visual / semantic PII; a regex pass catches deterministic patterns (emails, phones, JWTs, common API key prefixes). The merge step deduplicates overlapping detections.
- **OCR fallback** (Tesseract.js) when the regex pass needs text the model didn't surface.
- **Editable regions**: drag, resize, right-click, double-click to tweak any box before export.
- **Two redaction modes**: solid block or pixelate, with per-category toggle.
- **Export**: download a redacted PNG or copy directly to clipboard.

## How it works

```
┌──────────────┐    ┌───────────────────┐    ┌──────────────────┐
│  drop image  │──▶ │  Gemma 4 (WebGPU) │──▶ │  PIIRegion[]     │
└──────────────┘    │  + regex backstop │    │  (Zod-validated) │
                    │  + Tesseract OCR  │    └────────┬─────────┘
                    └───────────────────┘             │
                                                      ▼
                                          ┌──────────────────────┐
                                          │  canvas: draw + edit │
                                          │  export PNG          │
                                          └──────────────────────┘
```

All model work happens in a Web Worker so the UI stays responsive during the first-time download (a few hundred MB, cached after that).

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) — `Gemma4ForConditionalGeneration`, q4f16, WebGPU
- [Tesseract.js](https://github.com/naptha/tesseract.js) for OCR
- [Zod](https://zod.dev) to validate every JSON payload the model emits before it touches the canvas

## Run it locally

Requires Node 18+, pnpm, and a WebGPU-capable browser (Chrome 113+, Edge, recent Safari Tech Preview, or Firefox Nightly with `dom.webgpu.enabled`).

```bash
pnpm install
pnpm dev
```

Open the URL Vite prints, drop in a screenshot, and let the first-run model download finish. Subsequent loads come from cache and start in a few seconds.

```bash
pnpm build      # production build
pnpm preview    # preview the built bundle
pnpm lint       # eslint
```

## Performance targets

| Path                                      | Target           |
| ----------------------------------------- | ---------------- |
| First model load (50 Mbps)                | < 3 min          |
| Cached model load                         | < 5 s            |
| Per-image inference (M-series / RTX 3060) | < 6 s end-to-end |
| Lighthouse Accessibility                  | >= 95            |

## Privacy

Everything happens in the tab:

- The model is downloaded once from the Hugging Face CDN and cached by the browser.
- Image bytes, OCR text, and model output never leave the page.
- No analytics, no telemetry, no upload endpoint.

If you open the Network tab on a second visit, you will see zero requests after the initial paint.

## Project layout

```
src/
  worker/gemma.worker.ts   Gemma 4 load + inference, off main thread
  prompt.ts                System prompt + parser + Zod gate
  regex-pii.ts             Deterministic regex pass
  ocr.ts                   Tesseract.js wrapper
  merge.ts                 Merge regex + model regions
  schema.ts                Zod schema for PIIRegion / PIIResponse
  components/              UI (canvas, rail, detail panel, dropzone, etc.)
  lib/                     Categories, export, region geometry
design/Vanish.html         Pixel reference for the UI
```

## License

MIT.

## Acknowledgements

- [`onnx-community/gemma-4-E2B-it-ONNX`](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) for the quantized model weights.
- [kessler/gemma-gem](https://github.com/kessler/gemma-gem) and [nico-martin/gemma4-browser-extension](https://github.com/nico-martin/gemma4-browser-extension) for showing how `Gemma4ForConditionalGeneration` is wired up in transformers.js.
