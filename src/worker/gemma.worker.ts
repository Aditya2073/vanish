/// <reference lib="webworker" />

import {
  AutoProcessor,
  Gemma4ForConditionalGeneration,
  RawImage,
  TextStreamer,
  type PreTrainedModel,
  type Processor,
} from '@huggingface/transformers';

import type {
  ProgressInfo,
  WorkerInbound,
  WorkerOutbound,
} from '../types';
import type { PIIRegion } from '../schema';
import { ModelOutputParseError, PII_SYSTEM_PROMPT, parseModelResponse } from '../prompt';
import { detectRegexPII } from '../regex-pii';
import { mergeRegions } from '../merge';
import { runOCR } from '../ocr';

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const VISION_TOKEN_BUDGET = 256;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let processor: Processor | null = null;
let model: PreTrainedModel | null = null;
let loadPromise: Promise<void> | null = null;

function post(msg: WorkerOutbound) {
  ctx.postMessage(msg);
}

async function ensureLoaded(): Promise<void> {
  if (model && processor) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const onProgress = (info: ProgressInfo) => {
      post({ type: 'STATUS', status: 'loading', progress: info });
    };

    processor = await AutoProcessor.from_pretrained(MODEL_ID, {
      progress_callback: onProgress,
    });

    model = await Gemma4ForConditionalGeneration.from_pretrained(MODEL_ID, {
      dtype: 'q4f16',
      device: 'webgpu',
      progress_callback: onProgress,
    });

    post({ type: 'STATUS', status: 'ready' });
  })();

  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    processor = null;
    model = null;
    throw err;
  }
}

function bitmapToCanvas(bitmap: ImageBitmap): OffscreenCanvas {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('OffscreenCanvas 2D context unavailable');
  c.drawImage(bitmap, 0, 0);
  return canvas;
}

async function runModel(
  req: Extract<WorkerInbound, { type: 'GENERATE' }>,
  image: RawImage,
): Promise<string> {
  if (!processor || !model) throw new Error('Model not initialized');

  const userText = req.prompt && req.prompt.trim().length > 0
    ? `${PII_SYSTEM_PROMPT}\n\nAdditional instructions:\n${req.prompt}`
    : PII_SYSTEM_PROMPT;

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image' },
        { type: 'text', text: userText },
      ],
    },
  ];

  const prompt = processor.apply_chat_template(messages, {
    add_generation_prompt: true,
    // @ts-expect-error enable_thinking is a Gemma 4 template flag, not in the base types yet
    enable_thinking: false,
    tokenize: false,
  }) as string;

  const inputs = await (processor as unknown as (
    p: string,
    img: RawImage,
    a: null,
    o: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>)(prompt, image, null, {
    add_special_tokens: false,
    vision_token_budget: VISION_TOKEN_BUDGET,
  });

  let accumulated = '';
  const tokenizer = (processor as unknown as { tokenizer: ConstructorParameters<typeof TextStreamer>[0] }).tokenizer;
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
      accumulated += text;
      post({ type: 'STATUS', status: 'generating', id: req.id, token: text });
    },
  });

  await (model as unknown as {
    generate: (args: Record<string, unknown>) => Promise<unknown>;
  }).generate({
    ...inputs,
    max_new_tokens: req.maxNewTokens,
    do_sample: false,
    streamer,
  });

  return accumulated;
}

async function handleGenerate(req: Extract<WorkerInbound, { type: 'GENERATE' }>) {
  await ensureLoaded();
  const canvas = bitmapToCanvas(req.image);
  const image = RawImage.fromCanvas(canvas);

  const [modelSettled, ocrSettled] = await Promise.allSettled([
    runModel(req, image),
    runOCR(canvas),
  ]);

  const rawModelText = modelSettled.status === 'fulfilled' ? modelSettled.value : '';
  const ocrResult = ocrSettled.status === 'fulfilled' ? ocrSettled.value : null;

  let modelRegions: PIIRegion[] = [];
  let modelParseError: string | undefined;
  if (rawModelText) {
    try {
      modelRegions = parseModelResponse(rawModelText, {
        width: canvas.width,
        height: canvas.height,
      });
    } catch (err) {
      modelParseError =
        err instanceof ModelOutputParseError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
    }
  } else if (modelSettled.status === 'rejected') {
    modelParseError = modelSettled.reason instanceof Error
      ? modelSettled.reason.message
      : String(modelSettled.reason);
  }

  const regexRegions = ocrResult ? detectRegexPII(ocrResult) : [];
  const merged = mergeRegions(modelRegions, regexRegions);

  const ocrError =
    ocrSettled.status === 'rejected'
      ? ocrSettled.reason instanceof Error
        ? ocrSettled.reason.message
        : String(ocrSettled.reason)
      : undefined;

  post({
    type: 'REGIONS',
    id: req.id,
    regions: merged,
    rawModelText,
    ocrText: ocrResult?.text ?? '',
    modelParseError,
    ocrError,
  });
}

ctx.onmessage = async (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data;
  try {
    if (msg.type === 'LOAD') {
      post({ type: 'STATUS', status: 'loading' });
      await ensureLoaded();
    } else if (msg.type === 'GENERATE') {
      await handleGenerate(msg);
      post({ type: 'STATUS', status: 'ready' });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    post({
      type: 'STATUS',
      status: 'error',
      message,
      id: msg.type === 'GENERATE' ? msg.id : undefined,
    });
  }
};
