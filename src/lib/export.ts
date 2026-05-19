import type { ClientRegion } from './regions';
import type { RedactionMode } from '../components/RedactionModeToggle';
import { CATEGORY_META } from './categories';

type RenderOpts = {
  mode: RedactionMode;
  bitmap: ImageBitmap;
  regions: ClientRegion[];
};

const BLUR_STRENGTH = 14;

/**
 * Renders the redacted image to an OffscreenCanvas at full source resolution
 * and returns it as a PNG Blob. Regions are filtered by the caller; this
 * function applies the redaction style to whatever it's handed.
 */
export async function renderRedacted({ mode, bitmap, regions }: RenderOpts): Promise<Blob> {
  const W = bitmap.width;
  const H = bitmap.height;
  const canvas = new OffscreenCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable');

  ctx.drawImage(bitmap, 0, 0);

  for (const r of regions) {
    const x = Math.max(0, Math.round(r.bbox.x * W));
    const y = Math.max(0, Math.round(r.bbox.y * H));
    const w = Math.max(1, Math.round(r.bbox.w * W));
    const h = Math.max(1, Math.round(r.bbox.h * H));
    const cssColor = CATEGORY_META[r.category].cssVar;

    if (mode === 'solid') {
      ctx.fillStyle = '#000000';
      ctx.fillRect(x, y, w, h);
    } else if (mode === 'blur') {
      // Mosaic the region by downsampling then scaling back up. Pure-JS, no
      // CSS filter dependency.
      const tile = Math.max(4, Math.min(24, Math.floor(Math.min(w, h) / 8)) || 8);
      const small = new OffscreenCanvas(Math.max(1, Math.ceil(w / tile)), Math.max(1, Math.ceil(h / tile)));
      const sctx = small.getContext('2d');
      if (!sctx) continue;
      sctx.imageSmoothingEnabled = true;
      sctx.drawImage(bitmap, x, y, w, h, 0, 0, small.width, small.height);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
      ctx.restore();
      // Faint border so users can still see what was redacted.
      ctx.strokeStyle = cssColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      // Suppress unused var warning.
      void BLUR_STRENGTH;
    } else {
      // replace: draw a dark plate + the replacement text in monospace
      ctx.fillStyle = '#0E0F10';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#C6F432';
      const fontPx = Math.max(10, Math.min(h * 0.6, 28));
      ctx.font = `500 ${Math.round(fontPx)}px "JetBrains Mono", ui-monospace, Menlo, monospace`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      const padding = 8;
      const text = r.replacement;
      const maxWidth = w - padding * 2;
      ctx.fillText(text, x + padding, y + h / 2, maxWidth);
    }
  }

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob;
}

export async function copyImageBlobToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard || !('write' in navigator.clipboard)) {
    throw new Error('Clipboard write API not available in this browser');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ [blob.type]: blob }),
  ]);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
