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

const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
const VISION_TOKEN_BUDGET = 140;

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

async function bitmapToRawImage(bitmap: ImageBitmap): Promise<RawImage> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const c = canvas.getContext('2d');
  if (!c) throw new Error('OffscreenCanvas 2D context unavailable');
  c.drawImage(bitmap, 0, 0);
  return RawImage.fromCanvas(canvas);
}

async function handleGenerate(req: Extract<WorkerInbound, { type: 'GENERATE' }>) {
  await ensureLoaded();
  if (!processor || !model) throw new Error('Model not initialized');

  const image = await bitmapToRawImage(req.image);

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'image' },
        { type: 'text', text: req.prompt },
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

  const tokenizer = (processor as unknown as { tokenizer: ConstructorParameters<typeof TextStreamer>[0] }).tokenizer;
  const streamer = new TextStreamer(tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (text: string) => {
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

  // Streamer has already delivered the full text via callbacks; we send a
  // RESULT marker so the main thread can finalize state.
  post({ type: 'RESULT', id: req.id, text: '' });
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
