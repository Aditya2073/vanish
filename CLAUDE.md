# Vanish — Claude Code working notes

## What this project is
Browser-only, privacy-first PII redaction tool. The user drops a screenshot into a web page; Gemma 4 E2B runs on their GPU via WebGPU and returns bounding boxes for personal information; the user redacts, exports, done. Nothing leaves the device.

## Submission
dev.to Gemma 4 Challenge, "Build With Gemma 4" track. Deadline May 24, 2026 11:59 PM PDT. Tiebreaker is post reactions, so polish matters.

## Stack
- Vite + React + TypeScript
- Tailwind CSS (added in Phase 3)
- @huggingface/transformers (v4.x), Gemma4ForConditionalGeneration
- onnx-community/gemma-4-E2B-it-ONNX at q4f16
- Web Worker for all model code
- Tesseract.js for OCR
- Zod for structured-output validation

## Model API — do not get this wrong
- Use `Gemma4ForConditionalGeneration`, NOT `AutoModelForImageTextToText` (that's the Gemma 3n API).
- Load options: `{ dtype: "q4f16", device: "webgpu", progress_callback }`.
- Chat template: `apply_chat_template(messages, { enable_thinking: false, add_generation_prompt: true })`.
- Vision-token budget is a tuning knob (80/140/256/...). Default to 140.
- For inputs: `processor(prompt, image, audio, { add_special_tokens: false })`.

## Rules
1. NEVER guess at a transformers.js API method. If unsure, stop and ask.
2. NEVER put the model on the main thread. Worker only.
3. ALWAYS validate model JSON output through Zod before using it.
4. ALWAYS use the regex backstop alongside the model — emails, phones, keys, JWTs are too cheap to miss.
5. ALWAYS commit after each numbered task in a phase, with a conventional commit message.
6. ALWAYS run `pnpm build` before declaring a phase done.

## Reference implementations (open source, look at these when stuck)
- kessler/gemma-gem — Chrome extension, Gemma 4 E2B + WebGPU, offscreen document pattern.
- nico-martin/gemma4-browser-extension — same idea, slightly different architecture.
- onnx-community/gemma-4-E2B-it-ONNX model card — canonical loading + inference example.

## Visual design — source of truth
The UI design lives at `design/Vanish.html` (fetched from claude.ai/design at the start of Phase 3). It is the source of truth for layout, color, spacing, typography, and component anatomy. Do not improvise visuals. If something feels under-specified, open the file and read it again; if it still isn't covered, stop and ask. The design contains five mockups: main editor (dark), landing/empty state, model-loading state, mobile editor, and main editor (light).

The fetch command for Phase 3 step 0 (run before any UI code):
> Fetch this design file, read its README, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/hBRQLvKx57c9CG9TYs7KZw?open_file=Vanish.html
> Implement: Vanish.html

## Performance targets
- First model load: under 3 minutes on 50 Mbps.
- Cached model load: under 5 seconds.
- Per-image inference at token-budget 140 on M-series Mac / RTX 3060: under 6 seconds end-to-end.
- Lighthouse Accessibility >= 95.

## What "done" looks like
Phase 1: image in, sentence out, network tab empty after model download.
Phase 2: image in, validated PIIRegion[] out, regex + model merged.
Phase 3: working app with toggles, modes, export — pixel-faithful to `design/Vanish.html`.
Phase 4: deployed, extension working, README solid.
Phase 5: video + post live, reactions rolling.
