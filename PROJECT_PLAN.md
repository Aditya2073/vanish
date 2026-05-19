# Vanish — Claude Code Execution Plan

> **Goal:** Win the dev.to Gemma 4 Challenge "Build With Gemma 4" track ($500 + DEV++ + badge) by shipping a privacy-first, browser-only PII redaction tool powered by Gemma 4 E2B via WebGPU. Deadline: **May 24, 2026, 11:59 PM PDT**.

This document is the operating manual you give to Claude Code. It is structured so each phase has: (a) the exact prompt to paste into Claude Code, (b) the files Claude Code should create/edit, (c) the acceptance check before moving on, (d) the rollback rule if it fails.

---

## 0. Pre-flight (you, the human, ~30 minutes)

Do these once before opening Claude Code.

1. **Hardware sanity check.** You need a machine with WebGPU. Open `chrome://gpu` in Chrome or Edge — confirm "WebGPU: Hardware accelerated." Apple Silicon Mac, any RTX/discrete GPU, or recent integrated GPU works. If `chrome://gpu` says WebGPU is software/disabled, you cannot demo Vanish convincingly from this machine — switch machines now, not later.
2. **Install toolchain.** Node ≥ 20, pnpm (`npm i -g pnpm`), Git, Claude Code CLI. Verify with `node -v && pnpm -v && claude --version`.
3. **Create the repo skeleton manually** (Claude Code wastes tokens on this).
   ```bash
   mkdir vanish && cd vanish
   git init
   pnpm create vite@latest . --template react-ts
   pnpm install
   pnpm add @huggingface/transformers zod
   pnpm add -D @types/node
   ```
4. **Drop this file in as `PROJECT_PLAN.md`** at the repo root, plus the two helper files at the bottom of this doc (`CLAUDE.md` and `.claude-code/settings.local.json`).
5. **Create a `samples/` folder** and put 5 screenshots in it (you can mock them — the more realistic, the better the demo):
   - `crm.png` — a fake CRM record (name, email, phone, customer ID, balance)
   - `slack.png` — a fake Slack DM with an API key pasted in
   - `terminal.png` — a terminal showing an AWS access key and JWT
   - `billing.png` — a fake billing screen with card last-4 and address
   - `clean.png` — a control image with no PII (a code editor screenshot is perfect)
6. **Open Claude Code in this directory:** `cd vanish && claude`. Tell it: *"Read PROJECT_PLAN.md and CLAUDE.md. Acknowledge by listing the 5 phases. Do not write any code yet."*

If Claude Code can't list the five phases back correctly, your context is broken — restart it before continuing.

---

## How to work with Claude Code on this project

Six rules. Drill these in the first message of every session.

1. **One phase per Claude Code session.** Phases are sized so the context window stays clean. Start a new session for each.
2. **Always run the acceptance check before committing.** No "looks good to me" commits.
3. **Make Claude Code work in small commits.** Tell it explicitly: *"Commit after each task in the phase. Use conventional commit messages."*
4. **When stuck, paste the actual error verbatim.** Don't paraphrase. Don't summarize. The full stack trace gets you out faster than a description does.
5. **Forbid invention.** Tell Claude Code: *"If you do not know the exact transformers.js API for something, stop and ask. Do not guess method names."* The transformers.js v4 API is recent enough that some training data is stale.
6. **Reference repos are gold.** When something doesn't work, point Claude Code at `https://github.com/kessler/gemma-gem` and `https://github.com/nico-martin/gemma4-browser-extension` — both are working open-source Gemma 4 E2B + WebGPU implementations. Pattern-match shamelessly.

---

## The five phases at a glance

| Phase | Days | Deliverable | Risk if it fails |
|---|---|---|---|
| 1. Model boot | 1–2 | Gemma 4 E2B loads in browser, describes a test image | Highest. If broken by end of day 2, pivot. |
| 2. PII pipeline | 3–5 | Paste screenshot → structured JSON of PII regions | Medium. Prompt engineering, not infra. |
| 3. UX + canvas | 6–7 | Bounding-box overlay, category toggles, redact + export | Low. Standard React work. |
| 4. Polish + extension | 8–10 | Sample gallery, dark mode, Chrome MV3 wrapper | Low-medium. MV3 has quirks. |
| 5. Ship | 11–14 | Deployed at vanish.dev, demo video, blog post | Don't underestimate this. |

---

# Phase 1 — Model boot (Days 1–2)

**Objective:** Prove `Gemma4ForConditionalGeneration` loads in the browser via WebGPU and produces sensible output on an image. Everything else is downstream of this working.

## Phase 1 prompt for Claude Code

> We are building Vanish, a browser-only PII redaction tool. Phase 1 is loading Gemma 4 E2B via transformers.js and proving it can describe an image.
>
> Reference repos to mirror patterns from (do not copy code wholesale — these are not MIT-checked):
> - https://github.com/kessler/gemma-gem
> - https://github.com/nico-martin/gemma4-browser-extension
> - https://huggingface.co/onnx-community/gemma-4-E2B-it-ONNX (canonical model card with the working example)
>
> The canonical loading code, from the Hugging Face model card, is:
> ```ts
> import { AutoProcessor, Gemma4ForConditionalGeneration, TextStreamer, load_image } from "@huggingface/transformers";
> const model_id = "onnx-community/gemma-4-E2B-it-ONNX";
> const processor = await AutoProcessor.from_pretrained(model_id);
> const model = await Gemma4ForConditionalGeneration.from_pretrained(model_id, {
>   dtype: "q4f16",
>   device: "webgpu",
>   progress_callback: (info) => { /* update UI */ },
> });
> ```
> Do not use `AutoModelForImageTextToText` — that is the Gemma 3n API. Gemma 4 uses `Gemma4ForConditionalGeneration` explicitly.
>
> Tasks, in order, with a commit after each:
>
> 1. Move model loading into `src/worker/gemma.worker.ts` running as a Web Worker. The model and inference must run in the worker, not on the main thread, or the UI will freeze for the entire ~500 MB download and every inference call.
> 2. In the worker, expose three message types: `LOAD` (download + initialize), `GENERATE` (run inference on `{image: ImageBitmap, prompt: string, maxNewTokens: number}`), and `STATUS` (worker → main with `loading | ready | generating | error` + progress payload).
> 3. In `src/App.tsx` build a minimal UI: a "Load model" button, a progress bar reading the `STATUS` messages, a file/drag-drop input that produces an `ImageBitmap`, a prompt textarea (default: `"Describe this image in one sentence."`), and a generate button. Output streams into a `<pre>`.
> 4. Use `TextStreamer` from `@huggingface/transformers` so output streams token-by-token, not as one final blob.
> 5. Hardcode `vision_token_budget: 140` in the processor call. We'll surface it as a control later.
> 6. Cache the model in IndexedDB (transformers.js does this by default — verify by reloading the page and confirming the second load takes < 5 s).
> 7. Add a "Reset model cache" button that clears IndexedDB and reloads. We need this for testing.
>
> Do not add styling beyond a single CSS file. No Tailwind yet. No router. No state library. Just useState.
>
> When done, print the exact pnpm dev URL and tell me the three things I need to verify.

## Phase 1 file structure

```
src/
├── App.tsx                  ← minimal UI
├── App.css
├── main.tsx
├── worker/
│   └── gemma.worker.ts      ← all model code lives here
└── types.ts                 ← shared message types
```

## Phase 1 acceptance check

On `pnpm dev`, you should be able to:

1. ✅ Click "Load model" and see the progress bar advance to 100% within ~3 minutes on a 50 Mbps connection (~500 MB download).
2. ✅ Reload the page, click "Load model" again — second load completes in under 5 seconds (IndexedDB cache hit).
3. ✅ Drag in `samples/crm.png` with the prompt `"Describe this image in one sentence."` and get a coherent description streaming into the `<pre>` within 5 seconds.
4. ✅ Open Chrome DevTools → Network tab → filter Fetch/XHR. After the initial model download, generation produces **zero network requests**. (This is your killer demo moment — verify it works now.)
5. ✅ `pnpm build` succeeds and `pnpm preview` works.

**Go/no-go gate.** If any of 1–4 fails by end of Day 2, you have one of two pivots:
- **Pivot A:** Drop to text-only mode. Same product (redact PII in pasted text), still uniquely Gemma 4 because of browser-only inference, but the demo loses the multimodal wow factor.
- **Pivot B:** Reframe as a Tauri desktop app using local Ollama with `gemma4:e2b`. Lose the WebGPU story, keep the privacy story. Lower ceiling, but a guaranteed working path.

Decide which pivot at end of Day 2 if needed — do not let Day 3 start in an unknown state.

---

# Phase 2 — PII pipeline (Days 3–5)

**Objective:** Turn the model into a structured PII detector. Input: an image. Output: a typed JSON array of regions with category, bounding box, confidence, and a replacement suggestion.

## Phase 2 prompt for Claude Code

> Phase 1 is working. Now we wire Gemma 4 into a structured PII detection pipeline. The output of this phase is: given an image, return a typed JSON array of detected PII regions.
>
> Define the schema first, using Zod, in `src/schema.ts`:
> ```ts
> import { z } from "zod";
> export const PIICategory = z.enum([
>   "email", "phone", "person_name", "street_address",
>   "account_number", "balance", "api_key", "jwt",
>   "ip_address", "customer_id", "face", "free_text_secret",
> ]);
> export const PIIRegion = z.object({
>   category: PIICategory,
>   bbox: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
>   text: z.string().optional(),        // what the model thinks the text says
>   confidence: z.number().min(0).max(1),
>   replacement: z.string(),            // suggested redaction text
> });
> export const PIIResponse = z.object({ regions: z.array(PIIRegion) });
> ```
>
> The model prompt should:
> 1. Instruct Gemma 4 to return ONLY valid JSON matching that schema, with no prose, no markdown fences.
> 2. Define each category with one sentence of guidance (e.g., `account_number = any sequence of 6+ digits that appears to be a bank, customer, or order identifier`).
> 3. Use normalized coordinates (`0..1` of image width/height) for `bbox`. Convert to pixel coordinates in the post-processor.
> 4. Use Gemma 4's reasoning mode disabled: `apply_chat_template(..., { enable_thinking: false, add_generation_prompt: true })`. We need speed, not thought traces.
>
> Build a deterministic regex backstop in `src/regex-pii.ts`:
> - Run Tesseract.js OCR on the image (add `tesseract.js` as a dep).
> - Apply regexes for: email, phone (international + US formats), IPv4, IPv6, JWT pattern (`eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+`), AWS access key (`AKIA[0-9A-Z]{16}`), AWS secret pattern, GitHub PAT (`ghp_[A-Za-z0-9]{36}`), Stripe key (`sk_(live|test)_[A-Za-z0-9]+`).
> - Map each match back to a bounding box using Tesseract's word-level position data.
> - Emit `PIIRegion` objects with `confidence: 1.0` (regexes don't make mistakes within their domain).
>
> Build a merger in `src/merge.ts`:
> - Combine model regions + regex regions.
> - Deduplicate by IoU > 0.5 — when overlap, prefer the regex match (it's deterministic) but keep the model's category if the regex one is ambiguous.
> - Return a single sorted `PIIRegion[]`.
>
> Wire all three pieces into the worker's `GENERATE` handler. The worker now returns `{regions: PIIRegion[], rawModelText: string, ocrText: string}` for debugging.
>
> Add a debug panel in `App.tsx` that shows the raw model JSON, the OCR text, and the merged regions side by side. We'll remove this in Phase 3 but it is essential now.
>
> Commit after each of: schema, prompt + Zod validation, regex module, OCR integration, merger, worker wiring, debug panel.

## Phase 2 file structure (additions)

```
src/
├── schema.ts                ← Zod types
├── prompt.ts                ← system + user prompt builders
├── regex-pii.ts             ← deterministic backstop
├── ocr.ts                   ← Tesseract wrapper
├── merge.ts                 ← combine model + regex regions
└── worker/gemma.worker.ts   ← updated to use all of the above
```

## Phase 2 acceptance check

Run against the 5 sample screenshots:

1. ✅ `crm.png` → at least 4 of {name, email, phone, customer_id, balance} detected, no more than 1 false positive.
2. ✅ `terminal.png` → AWS key and JWT detected by the **regex** backstop (verify in debug panel). Don't trust the model alone for these.
3. ✅ `slack.png` → the pasted API key region is flagged.
4. ✅ `billing.png` → card-related fields and address detected.
5. ✅ `clean.png` (no-PII control) → zero or near-zero regions. Critical for trust.
6. ✅ Model JSON parses cleanly via Zod on ≥ 4 of 5 sample images. If the model emits malformed JSON > 20% of the time, harden the prompt with explicit `Return ONLY a JSON object matching: {...example...}` and a few-shot example.
7. ✅ End-to-end latency on a 1280×800 screenshot, vision-token-budget 140, M-series Mac or RTX 3060: under 6 seconds total (model + OCR run in parallel).

**Common failure mode:** Gemma 4 E2B will sometimes return prose explaining its JSON, or wrap it in ```` ```json ``` ````. Strip with a robust pre-parser before handing to Zod: extract the first `{...}` block and parse that. Don't try to make the model perfect — make the parser forgiving.

**Tuning knob if too slow:** drop `vision_token_budget` to 80 (faster, dumber). If too inaccurate: bump to 256 (slower, sharper). The HF blog confirms this is a configurable speed/quality dial.

---

# Phase 3 — UX + canvas (Days 6–7)

**Objective:** Turn the debug panel into a product, matching the Vanish design spec. Bounding-box overlay, per-category toggles, three redaction modes, export.

The visual design has already been produced separately on claude.ai/design and is hosted as a downloadable HTML reference. Phase 3 starts by fetching that file and treating it as the source of truth for layout, color, spacing, and typography. Do not improvise visuals.

## Phase 3 prompt for Claude Code

> Phases 1–2 are working. Now we build the user-facing app to match the finalized Vanish design spec.
>
> **Step 0 — fetch and read the design.** Run this first, before anything else:
>
> > Fetch this design file, read its README, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/hBRQLvKx57c9CG9TYs7KZw?open_file=Vanish.html
> > Implement: Vanish.html
>
> Save the fetched file to `design/Vanish.html` in the repo, commit it as `chore: import design spec from claude.ai/design`, and read it end to end before writing any UI code. The design contains five mockups: main editor (dark), landing/empty state, model-loading state, mobile editor, and main editor (light). Match the colors, spacing, borders, typography, and component anatomy exactly. If something in the design conflicts with this prompt, the design wins — flag the conflict to me but follow the design.
>
> **Step 1 — clean up.** Remove the Phase 2 debug panel and prompt textarea; users never see those.
>
> **Step 2 — design tokens.** Before any components, extract the design tokens from `Vanish.html` into a single source of truth. Two options:
> - If we're using Tailwind: configure tokens in `tailwind.config.ts` (`theme.extend.colors`, `spacing`, `fontFamily`, `borderRadius`, etc.) so utilities map 1:1 to the design.
> - If we're using vanilla CSS variables (the design uses them): copy the `:root` block from `Vanish.html` into `src/styles/tokens.css` and import it once in `main.tsx`.
> Pick Tailwind for velocity. Run: `pnpm add -D tailwindcss postcss autoprefixer && pnpm tailwindcss init -p`. Mirror every color in the design's `:root` block as a Tailwind color token (`bg`, `surface-1`, `surface-2`, `border`, `border-strong`, `text`, `text-2`, `text-3`, `accent`, plus each category color named after its category — `email`, `phone`, `name`, etc.). Mirror the font stacks too (`sans`, `mono`).
>
> **Step 3 — component build.** Build these components in order. For each one, open `design/Vanish.html` in your head (or actually open it side by side) and match the mockup precisely. Pixel-faithfulness is the bar.
>
> 1. `<TopBar />` — the 48px top bar from the design: wordmark on the left with the faded `n`, breadcrumb in monospace, model status pill on the right with the 6px lime dot and `Gemma 4 E2B` subtitle, Privacy link.
> 2. `<Dropzone />` — the landing-state drop target with the 2px dashed border inset 32px, the `image-plus` icon, the headline, and the "Try a sample" lime button. Also the five sample thumbnails strip beneath. Implements paste (Ctrl/Cmd+V), drag-drop, and click-to-choose, all funneling into the same handler.
> 3. `<HowItWorksCard />` — the right-rail explainer shown only in the empty state.
> 4. `<ModelLoadingState />` — the progress ring (48px diameter, 2px stroke, lime fill on `#2A2E33` track) with the percentage inside, the download metrics line beneath, and the reassuring "Nothing else leaves your device" copy. No cancel button.
> 5. `<CategoryRail />` — 220px left rail. `DETECTED` all-caps header, 36px-tall rows with 10px color swatch, label, monospace count badge in a pill, and a 28×16 lime toggle. The "+ Add region manually" action row at the bottom and the "N regions detected" summary.
> 6. `<RedactionCanvas />` — the canvas area with the faint 24px dotted grid background. Source image rendered as the inner content. SVG overlay (not canvas-on-canvas) draws each region's rectangle: 2px solid border in the category color + 12% opacity fill. Selected box gets the 1px white outer ring (`#F2F3F5`). Tiny floating labels at top-left of selected and two highest-confidence boxes only, in 10px monospace tertiary text on a `#0E0F10` chip. Optional: lime corner crosshairs in each canvas corner if the design includes them.
> 7. `<DetailPanel />` — 280px right panel, slides in when a region is selected. Header with color swatch and category name, then `Detected text` block in monospace inside a bordered `#0E0F10` box, `Replacement` editable field, `Confidence` bar (4px tall, filled to N% in the category color), `Source` chips (`Model` filled with lime border, `Regex` outlined). Bottom secondary buttons: `Delete region`, `Lock`.
> 8. `<RedactionModeToggle />` — the segmented control in the bottom bar: three options `Solid` / `Blur` / `Replace`. Active option gets lime background and near-black text. 12px tall total.
> 9. `<ExportBar />` — bottom 56px bar. Mode toggle on the left, `Copy ⌘C` (secondary) and `Download ⌘D` (primary, lime) buttons on the right with monospace keyboard hints in tertiary text.
> 10. `<ScanLineIndicator />` — the 1px lime indicator at the very top. Resting state: 30% opacity, 2px width, top-bar corner. Active state during inference: animate to 60% width across the top, lime, ~1.2s loop. CSS animation only, no JS.
>
> **Step 4 — interaction details.**
> - Boxes are draggable and resizable by their corner handles (5px squares, lime fill, white border). Selection handles only appear on the selected box.
> - Right-click on a box deletes it.
> - Double-click on an empty area creates a new manual region; user picks the category from a popover styled to match the design's panel aesthetic (`#1E2125` surface, `#2A2E33` border, 1px).
> - Undo/redo: Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, simple action stack in a `useReducer`.
> - Hovering a category row in the rail dims all other-category boxes to 20% opacity. Hovering a box highlights its category row in the rail.
>
> **Step 5 — responsive.**
> - Match the mobile mockup at ≤640px: category rail collapses to a 44px horizontal scrollable strip beneath the top bar, detail panel becomes a bottom sheet with a `#3A3F45` drag handle, action buttons become icon-only.
> - The light-mode mockup is the second main-editor variant in the design. Add a dark/light toggle in the top bar (next to Privacy), persisted to `localStorage`. Default is dark.
>
> **Step 6 — accessibility.** Every interactive element keyboard-navigable. Every bounding box has an ARIA label including category and confidence. Category colors are never the only signal — pair every color with the category icon and label. Focus rings: 2px lime outline at 2px offset, never `outline: none` without a replacement.
>
> **Step 7 — no improvising.** Don't add gradients, glassmorphism, rounded-everything, emoji in UI, or "AI sparkle" iconography. Don't add icon backgrounds. Don't add shadows — the design uses borders, not shadows. If you reach for a stylistic decision not covered by `design/Vanish.html`, stop and ask.
>
> Commit after each numbered task in Step 3. After Step 7, run `pnpm build` and tell me the deployed preview URL plus a 30-second test script I can run to verify Phase 3 acceptance.

## Phase 3 file structure (additions)

```
design/
└── Vanish.html              ← fetched from claude.ai/design, the visual source of truth

src/
├── components/
│   ├── TopBar.tsx
│   ├── Dropzone.tsx
│   ├── HowItWorksCard.tsx
│   ├── ModelLoadingState.tsx
│   ├── CategoryRail.tsx
│   ├── RedactionCanvas.tsx
│   ├── DetailPanel.tsx
│   ├── RedactionModeToggle.tsx
│   ├── ExportBar.tsx
│   └── ScanLineIndicator.tsx
├── hooks/
│   ├── useRedaction.ts      ← useReducer for action stack
│   ├── useGemmaWorker.ts    ← wraps worker postMessage
│   └── useTheme.ts          ← dark/light persisted to localStorage
└── lib/
    ├── render.ts            ← redact-to-PNG offscreen canvas logic
    └── categories.ts        ← category → color + icon + label map
```

## Phase 3 acceptance check

1. ✅ `design/Vanish.html` is committed at repo root and matches the file served by the design URL.
2. ✅ Open the deployed app side-by-side with `design/Vanish.html` in another tab. Spot-check: top bar height, category rail width, drop-target dashed border inset, category swatch size, button radii, font weights, and the lime accent. Visible deviations need a fix-or-justify before this phase closes.
3. ✅ Cold load → drop `crm.png` → boxes appear within ~6 s, no UI jank during inference.
4. ✅ Toggle "email" off → all email boxes vanish instantly. Toggle on → they return.
5. ✅ Resize one box, delete another, add one manually → all reflected in the export.
6. ✅ Switch redaction mode Solid → Blur → Replace; export PNG in each; verify visually they look right and at full source resolution.
7. ✅ Copy-to-clipboard works; paste into a chat app and the image appears.
8. ✅ Ctrl+Z/Y stack works for at least 10 actions deep.
9. ✅ Tab through the UI with keyboard only — every action reachable, every focus state visible (2px lime outline).
10. ✅ Mobile layout at 390×844 matches the mobile mockup: collapsed category strip, bottom-sheet detail panel, icon-only action buttons.
11. ✅ Light-mode toggle works and matches the light-mode mockup; preference persists across reload.
12. ✅ Lighthouse: Performance ≥ 90 (excluding the model download), Accessibility ≥ 95.

---

# Phase 4 — Polish + extension (Days 8–10)

**Objective:** Make the demo unmissable, add the Chrome extension wrapper, write the README.

## Phase 4 prompt for Claude Code

> Phase 3 ships a working product. Now we polish for the judging panel and add a Chrome extension.
>
> Tasks:
>
> 1. Landing screen (when no image is loaded): a single, calm hero with a one-line value prop, a "Load model" button, the privacy proof (model size + "runs entirely on your device"), and 5 sample-screenshot thumbnails that load on click. Keep the prose under 40 words total.
> 2. First-run experience: when the model isn't cached yet, show an honest progress UI ("Downloading Gemma 4 E2B, ~500 MB, one-time"). Use the `progress_callback` data from the worker. Show download speed and ETA. Never show a spinner without progress text — judges hate dishonest loading states.
> 3. Sample gallery: pre-bundle the 5 sample PNGs (`/public/samples/`) and let users try the app without uploading anything. This is critical — most judges will not bother uploading their own image.
> 4. Dark mode toggle, persisted to `localStorage`.
> 5. Empty/error states for: WebGPU not supported (clear message + link to instructions), model load failure (retry button), generation error (retry + report-issue link).
> 6. A "Privacy" page at `/privacy` (a single route, not a router — handle with conditional render keyed off `location.hash`) explaining exactly what runs where. This is the page the judges and reactions audience will share.
> 7. Chrome MV3 extension in `/extension/`:
>    - Manifest v3, `offscreen` API to host transformers.js (mirror `kessler/gemma-gem` architecture).
>    - Single command: `chrome.tabs.captureVisibleTab` → pass image to offscreen → run same pipeline → open a popup with the redacted result + copy button.
>    - Default browser action icon + a context-menu entry "Redact this tab with Vanish."
>    - Share the worker code with the web app via a `packages/` layout? No — too much yak-shaving. Duplicate the worker file into the extension. We can refactor later.
> 8. README.md at repo root: hero image, one-paragraph pitch, install instructions, architecture diagram (ASCII art is fine), the explicit "Why Gemma 4 E2B specifically" section (this is the judging criterion), MIT license, link to the blog post + demo video (placeholder URLs for now).
> 9. Add a GitHub Actions workflow `.github/workflows/deploy.yml` that builds and deploys the web app to GitHub Pages on push to `main`.
>
> Commit after each numbered task.

## Phase 4 acceptance check

1. ✅ Open the deployed Pages URL in an incognito window on a friend's machine. They can use the app without instructions. Without help, they should redact a screenshot in under 60 seconds from first paint.
2. ✅ Extension loads in `chrome://extensions` (Developer Mode → Load unpacked → `extension/dist`). Right-click any page → "Redact this tab with Vanish" → screenshot is taken and redacted.
3. ✅ Network tab during inference: empty. Verify in DevTools.
4. ✅ Lighthouse Accessibility ≥ 95 still holds.
5. ✅ Toggling dark mode persists across reload.
6. ✅ README renders cleanly on GitHub; the "Why Gemma 4" section is at least 200 words.

---

# Phase 5 — Ship (Days 11–14)

**Objective:** The actual win condition. Demo video, blog post, deploy, engagement plan.

This phase is **not** primarily Claude Code work. The demo video and blog post are where the prize is won. Budget the time accordingly:

- **Day 11:** Record demo video. Three takes minimum, edited to 55–60 seconds.
- **Day 12:** Write the blog post (1,500–2,000 words). Have Claude Code help draft, but rewrite it in your own voice — judges can smell pure-AI prose.
- **Day 13:** Deploy `vanish.dev` (or whatever domain), publish post on dev.to, add `#gemmachallenge` tag, cross-post Twitter/X + Bluesky/Mastodon thread.
- **Day 14:** Engage with every comment within six hours, respond to every reaction, keep the post on the trending feed. Reactions are the explicit tiebreaker.

## Demo video shot list (60 seconds)

The exact storyboard from the strategy doc — record this verbatim:

| Time | Shot | Caption (on-screen) |
|---|---|---|
| 0:00–0:05 | Real CRM screenshot in finder, drag to address bar | "I'm about to share this screenshot." |
| 0:05–0:10 | Vanish loads, "Ready" pill visible, drop the file | "Drop." |
| 0:10–0:18 | Boxes fade in over PII | "Gemma 4 finds the PII." |
| 0:18–0:25 | Toggle email off, then on, change mode to Blur | "You stay in control." |
| 0:25–0:40 | DevTools opens, Network tab, run inference again, **panel stays empty** | "Zero bytes leave your machine." |
| 0:40–0:50 | Cut to architecture diagram: transformers.js → ONNX Runtime → WebGPU → GPU | "Apache 2.0. ~500 MB. Cached after first visit." |
| 0:50–0:60 | URL + repo + "Built solo in 12 days with Claude Code" | "vanish.dev" |

Record on the highest-res monitor you have. Export at 1080p minimum, 60fps if possible. The Network-tab-empty moment is the screenshot that sells the project; make sure it's pixel-perfect.

## Blog post outline

Use this skeleton verbatim — it's tuned for the judging rubric:

```
# Vanish: a PII redactor that never sees your screen

[Hook — 60 words, the "oh no I just posted credentials" anecdote]

## Why the cloud is the wrong place for this

[Why uploading a sensitive screenshot to a redaction API defeats the point. The minute it touches a server, you've lost.]

## What changed in April 2026

[Gemma 4 release. Apache 2.0. Day-zero ONNX. WebGPU-ready transformers.js. Three ingredients that finally cross the threshold.]

## Why Gemma 4 E2B specifically

[~500 MB after q4f16, multimodal, 128K context, runs on a laptop GPU. Direct comparison: closed APIs can't run client-side at all. Other open models don't have day-zero browser-ready checkpoints with vision encoders. This is the JUDGING-CRITERION paragraph. Make it bulletproof.]

## The pipeline

[Architecture diagram. Worker. Vision-token-budget tuning. Why a regex backstop matters (recall on emails/keys/JWTs without trusting an LLM). Zod-validated structured output.]

## Three lessons

[1. WebGPU memory: monitor it, transformers.js can OOM at certain dtype combinations.
2. Prompt JSON reliability: tame it with a forgiving parser + Zod, not with a stricter prompt.
3. Vision-token budget is the speed/quality dial nobody talks about.]

## What's next

[Tauri build for Firefox/Safari. Audio redaction for screen recordings (Gemma 4 E2B has native audio input — nobody else can do this in a browser). Fine-tune on synthetic PII data.]

## Try it

[Link to vanish.dev. Link to repo. Link to demo video.]
```

## Submission post on dev.to

Tag with `#gemmachallenge` (the official challenge tag — check the launch post). Include in the post:

- The challenge category: **Build With Gemma 4**.
- The required "How I Used Gemma 4 / Which Model and Why" section — copy that from the blog post.
- An embedded demo video (dev.to supports YouTube/Vimeo embeds).
- A live demo link.
- The GitHub repo (MIT or Apache 2.0 license required — pick Apache 2.0 to match Gemma 4 itself).
- A "Built with" note crediting transformers.js, ONNX Runtime Web, and Claude Code.

## Engagement playbook

- Publish Tuesday morning PT (most dev.to traffic).
- Pin a comment with the demo video timestamp links.
- Cross-post: Twitter/X with the 90-second cut + the empty-Network-tab screenshot, Bluesky thread, LinkedIn (yes, it works for hackathon visibility), Mastodon Fosstodon.
- Reply to every comment within six hours for the first three days.
- Don't beg for reactions in the post. Do reply "thanks!" to every reaction-leaver — dev.to surfaces engagement back to feeds.

---

## Appendix A — `CLAUDE.md` (drop at repo root)

Put this file at the repo root. Claude Code reads it automatically on every session and treats it as persistent context.

```markdown
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
Phase 3: working app with toggles, modes, export.
Phase 4: deployed, extension working, README solid.
Phase 5: video + post live, reactions rolling.
```

## Appendix B — `.claude-code/settings.local.json`

Pre-approve the bash commands Claude Code will run dozens of times. Otherwise it'll stop and ask for every `pnpm install`.

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm install)",
      "Bash(pnpm install:*)",
      "Bash(pnpm add:*)",
      "Bash(pnpm add -D:*)",
      "Bash(pnpm dev)",
      "Bash(pnpm build)",
      "Bash(pnpm preview)",
      "Bash(pnpm test:*)",
      "Bash(pnpm tsc:*)",
      "Bash(npx tsc:*)",
      "Bash(git add:*)",
      "Bash(git commit:*)",
      "Bash(git status)",
      "Bash(git diff:*)",
      "Bash(git log:*)",
      "Bash(mkdir:*)",
      "Bash(ls:*)",
      "Bash(cat:*)"
    ],
    "deny": [
      "Bash(git push:*)",
      "Bash(rm -rf:*)"
    ]
  }
}
```

Push is denied on purpose — you push manually after reviewing diffs.

## Appendix C — kill-switch decisions

You will hit problems. Decide your responses in advance so you don't lose a day to indecision.

| Symptom | Day-2 cutoff response | Day-5 cutoff response | Day-8 cutoff response |
|---|---|---|---|
| Model won't load in worker | Pivot to text-only mode | Pivot to Tauri + Ollama | Already shipped, irrelevant |
| Model loads but inference is > 15 s per image | Drop token-budget to 80; document the limit | Add a "this is slow on integrated GPUs" notice | Document in blog as a known limit |
| Model JSON output is unreliable | Add few-shot examples + lenient parser | Add 3 retries with temperature reset | Document in blog as engineering reality |
| WebGPU OOMs on E2B | Stay on E2B but flush KV cache between calls | Stay on E2B with a hard image-size cap | Document the cap |
| Tesseract too slow | Run in parallel with model in the worker | Lazy-load Tesseract only when needed | Already optimized, irrelevant |
| Chrome extension breaks | Cut it from v1, web app only | Cut it from v1, web app only | Ship without; mention in blog as next step |

Decision rule: every cutoff column to the right is a smaller, more dignified retreat. Never expand scope past what's already working.

---

## Appendix D — first message to Claude Code

Copy-paste this verbatim as the first message of your first Claude Code session:

> Read PROJECT_PLAN.md and CLAUDE.md in full before doing anything. Then answer three questions:
>
> 1. What is the exact transformers.js class we use to load Gemma 4 E2B, and what option keys go in the second argument to `from_pretrained`?
> 2. Why are we using a Web Worker?
> 3. What are the five phases and which one are we starting?
>
> Do not write any code in your reply. After you answer, I will tell you to start Phase 1.

If Claude Code answers wrong, fix the answer before letting it touch a single file. The rest of the project rides on those three facts.
