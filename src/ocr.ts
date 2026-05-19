import Tesseract from 'tesseract.js';
import type { OCRPage, OCRWord } from './regex-pii';

let workerPromise: Promise<Tesseract.Worker> | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('eng');
  }
  return workerPromise;
}

function flattenWords(page: Tesseract.Page): OCRWord[] {
  const out: OCRWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        for (const word of line.words) {
          const t = word.text?.trim();
          if (!t) continue;
          out.push({
            text: t,
            bbox: {
              x: word.bbox.x0,
              y: word.bbox.y0,
              w: word.bbox.x1 - word.bbox.x0,
              h: word.bbox.y1 - word.bbox.y0,
            },
          });
        }
      }
    }
  }
  return out;
}

export async function runOCR(
  canvas: OffscreenCanvas,
): Promise<OCRPage> {
  const worker = await getWorker();
  const result = await worker.recognize(canvas, undefined, { blocks: true, text: true });
  const page = result.data;
  return {
    text: page.text ?? '',
    words: flattenWords(page),
    width: canvas.width,
    height: canvas.height,
  };
}

export async function terminateOCR(): Promise<void> {
  if (!workerPromise) return;
  const worker = await workerPromise;
  workerPromise = null;
  await worker.terminate();
}
