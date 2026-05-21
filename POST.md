<!--
  dev.to draft for the Gemma 4 Challenge.

  Title:  Vanish — drop a screenshot, PII disappears, nothing leaves your device
  Tags:   devchallenge, gemmachallenge, gemma, webgpu

  Paste the body below into the dev.to editor. The HTML comment lines at the
  top of dev.to's template (the "## What I Built" etc. comments) are already
  filled in here.
-->

*This is a submission for the [Gemma 4 Challenge: Build with Gemma 4](https://dev.to/challenges/google-gemma-2026-05-06)*

## What I Built

**Vanish** is a browser-only redaction tool. You drop in a screenshot — a CRM record, a Slack thread, a terminal session, a billing dashboard — and Gemma 4 finds the personal information inside it. You click to redact, then export the cleaned PNG. The entire pipeline runs on your GPU in the tab. Nothing is uploaded. The Network tab is empty after the first model download.

Sharing screenshots is the most common way humans leak data they didn't mean to share — a customer's email in a bug report, a bearer token in a stack trace, an account number in a support ticket. Existing redaction tools want you to upload the very thing you're trying to protect. That's backwards. Vanish keeps the screenshot in the tab and brings the model to it.

It detects 12 categories of PII:

- email, phone, person name, street address
- account number, balance, customer ID
- API key, JWT, IP address
- face
- free-text secret (anything sensitive that doesn't fit a clean schema)

Each detection is a bounding box you can drag, resize, or delete. Two redaction modes — solid block or pixelate — and a per-category toggle, so you can leave names visible while killing account numbers, or vice versa. Export as PNG or copy straight to the clipboard.

## Demo

> 🎥 *Video walkthrough coming with the final submission.*

Live demo and source: **https://github.com/Aditya2073/vanish**

A typical run on an M-series Mac or RTX 3060:

| Step                              | Time           |
| --------------------------------- | -------------- |
| First model load (50 Mbps)        | ~2–3 min       |
| Cached load (any subsequent visit)| ~3–5 s         |
| Inference per screenshot          | ~4–6 s         |

## Code

Repo: **https://github.com/Aditya2073/vanish**

```
src/
  worker/gemma.worker.ts   ← Gemma 4 load + inference, in a Web Worker
  prompt.ts                ← system prompt + JSON parser + Zod gate
  regex-pii.ts             ← deterministic regex pass (emails, phones, JWTs, keys)
  ocr.ts                   ← Tesseract.js, when the model misses text positions
  merge.ts                 ← merge + dedupe model and regex regions
  schema.ts                ← Zod schema for every region the canvas sees
  components/              ← the editor UI: canvas, rail, detail panel, export bar
```

The interesting bits:

**Worker boundary.** The model is heavy — quantized q4f16 Gemma 4 E2B is still a few hundred MB. Putting it on the main thread would freeze the canvas during inference. Everything model-related lives in `src/worker/gemma.worker.ts`; the app sends `{ type: 'GENERATE', image }` messages and receives streamed status / region updates back.

**Zod between the model and the UI.** LLMs hallucinate JSON. I validate every payload before any pixel changes:

```ts
// src/prompt.ts
const PIIResponse = z.object({
  regions: z.array(z.object({
    category: PIICategory,
    bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
    text: z.string().optional(),
    confidence: z.number().min(0).max(1),
    replacement: z.string(),
  })),
});
```

A malformed response throws `ModelOutputParseError`, the UI shows a soft error, and the regex pass still runs. The canvas never trusts the model directly.

**Regex backstop.** A vision model is great at spatial things (faces, address blocks, table cells) and shaky at long random strings. So a deterministic pass runs alongside it for the cheap wins — emails, phone numbers, JWTs, common API key prefixes (`AKIA…`, `ghp_…`, `sk_live_…`). Tesseract OCR provides text + positions for whatever the regex matches. `merge.ts` deduplicates overlapping boxes from the two passes.

**WebGPU only.** The browser does the work the cloud usually does. No backend, no API key, no rate limit, no "we promise not to log this." Chrome 113+, Edge, recent Safari Tech Preview, or Firefox Nightly with `dom.webgpu.enabled`.

## How I Used Gemma 4

I used **Gemma 4 E2B** — the smaller of the two open-weight Gemma 4 models — quantized to **q4f16** via the [`onnx-community/gemma-4-E2B-it-ONNX`](https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX) build, served by `@huggingface/transformers` and run on WebGPU.

Why E2B and not a larger variant:

1. **It has to fit in a tab.** A 4B-active-param model at q4 weighs in light enough that a typical consumer GPU can run it without swapping. The bigger Gemma 4 models would either OOM or thrash on most user hardware. The whole pitch is "drop a screenshot, get an answer in a few seconds" — that means the model has to *load* in a few seconds on a return visit and *run* in a few seconds on first inference.
2. **It's multimodal where I needed it.** The job is "look at an image, return JSON with bounding boxes." Gemma 4's vision tower is the load-bearing piece — text-only models would force me to OCR-then-classify, which loses spatial context (where on the screen the email actually is). E2B's vision encoder gave usable normalized bbox coordinates with a vision-token budget of 256.
3. **It's instruction-tuned and predictable.** With `enable_thinking: false` and a tightly-specified system prompt that lists the 12 categories verbatim and forbids invented ones, the model emits clean JSON ~95% of the time. The remaining 5% is what the Zod gate is there for.

The loader is straight from the model card:

```ts
processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });

model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
  dtype: 'q4f16',
  device: 'webgpu',
  progress_callback,
});
```

The one thing I want to flag for anyone else trying this: it's `Gemma4ForConditionalGeneration`, **not** `AutoModelForImageTextToText`. The latter is the Gemma 3n API and will silently fail to load Gemma 4 weights — I burned an evening on that before reading the model card more carefully.

The vision-token budget is a real tuning knob. 80 tokens is too coarse for dense screenshots (Slack threads, billing tables); 256 is the sweet spot for the screenshots I care about, with 140 as a fast fallback for sparse images.

That's it. The model finds the PII, regex catches what the model misses, Zod keeps the canvas honest, and your data never touches a server.

---

🛠️ Built with Gemma 4 · Source: https://github.com/Aditya2073/vanish
