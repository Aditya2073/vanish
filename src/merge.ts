import type { Bbox, PIIRegion } from './schema';

const IOU_THRESHOLD = 0.5;

// Categories that are catch-all / ambiguous and should yield to a more
// specific model-supplied category when bboxes overlap.
const AMBIGUOUS_CATEGORIES = new Set<PIIRegion['category']>([
  'free_text_secret',
]);

function iou(a: Bbox, b: Bbox): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix1 = Math.max(a.x, b.x);
  const iy1 = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  if (ix2 <= ix1 || iy2 <= iy1) return 0;
  const inter = (ix2 - ix1) * (iy2 - iy1);
  const union = a.w * a.h + b.w * b.h - inter;
  if (union <= 0) return 0;
  return inter / union;
}

function bboxIsZero(b: Bbox): boolean {
  return b.w === 0 && b.h === 0;
}

/**
 * Merge model regions with regex regions. Regex wins on overlap (IoU > 0.5):
 * its deterministic bbox and category are kept, but if the regex region's
 * category is ambiguous (catch-all), the model's more specific category is
 * borrowed onto the merged region.
 *
 * Regex regions with a zero bbox (full-text fallback matches) only suppress
 * model regions when their text matches; they cannot dedupe geometrically.
 */
export function mergeRegions(
  modelRegions: PIIRegion[],
  regexRegions: PIIRegion[],
): PIIRegion[] {
  const out: PIIRegion[] = [];

  const regexWithBbox = regexRegions.filter((r) => !bboxIsZero(r.bbox));
  const regexTextSet = new Set(
    regexRegions
      .map((r) => r.text?.trim())
      .filter((t): t is string => !!t),
  );

  for (const regex of regexRegions) {
    let merged = regex;
    for (const model of modelRegions) {
      if (iou(regex.bbox, model.bbox) > IOU_THRESHOLD) {
        if (AMBIGUOUS_CATEGORIES.has(regex.category) && !AMBIGUOUS_CATEGORIES.has(model.category)) {
          merged = { ...merged, category: model.category };
        }
        break;
      }
    }
    out.push(merged);
  }

  for (const model of modelRegions) {
    // Drop model regions geometrically covered by a regex hit.
    const geometricallyCovered = regexWithBbox.some(
      (r) => iou(r.bbox, model.bbox) > IOU_THRESHOLD,
    );
    if (geometricallyCovered) continue;

    // Drop model regions whose text exactly matches a regex hit (handles the
    // full-text fallback case where the regex couldn't produce a bbox).
    const modelText = model.text?.trim();
    if (modelText && regexTextSet.has(modelText)) continue;

    out.push(model);
  }

  out.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  return out;
}
