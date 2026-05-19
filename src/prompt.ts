import { z } from 'zod';
import { Bbox, PIICategory } from './schema';
import type { PIIRegion } from './schema';

export const PII_SYSTEM_PROMPT = `You are a PII detector for screenshots. Return ONLY one JSON object with this shape:
{"regions":[{"category":"email","bbox":{"x":0.12,"y":0.34,"w":0.20,"h":0.04},"text":"alice@example.com","confidence":0.95,"replacement":"[email]"}]}

Every region MUST include all five keys: category, bbox, text, confidence, replacement.

Coordinates: bbox.x, bbox.y, bbox.w, bbox.h MUST be numbers between 0 and 1 (a fraction of the image width or height). Origin is top-left. DO NOT return pixel values. If the image is 800 pixels tall and the region starts halfway down, bbox.y is 0.5, NOT 400.

"text" is the literal visible text inside the bbox, max 80 characters. "replacement" is a short drop-in redaction like "[email]" or "[phone]". "confidence" is between 0 and 1.

If no PII is present, return exactly: {"regions":[]}

Categories (use these strings VERBATIM; do not invent new ones like "state", "postal_code", "address_line"):
- email: an email address.
- phone: a phone number, US or international.
- person_name: a real person's first and/or last name.
- street_address: any postal address line, including state, ZIP/postal code, and country when shown together with the address. Emit ONE region covering the visible address block, not separate regions per field.
- account_number: a digit sequence (6+) acting as a bank, customer, or order id. Use this for card-last-4 ("4242"), account numbers, and order numbers.
- balance: a currency amount tied to a person or account.
- api_key: an API key, access token, secret, or credential string (e.g. AKIA..., ghp_..., sk_live_...).
- jwt: a JSON Web Token (three base64 segments separated by dots, usually starting with "eyJ").
- ip_address: an IPv4 or IPv6 address.
- customer_id: an alphanumeric customer / user / account identifier (not just digits).
- face: a visible human face.
- free_text_secret: any other clearly sensitive text not covered above.

NOT PII — return zero regions for screenshots that only show these:
- Source code, function names, variable names, type annotations, language keywords.
- File names, file extensions (.ts, .js, .py, .md, etc.), file paths, folder names.
- Code editor chrome: tab titles, breadcrumbs, sidebar items, status bar, line numbers, menu bar.
- App chrome: button labels, menu items, dialog titles, app names, logos.
- Field labels themselves (the word "Email", "Name", "Address" without a value).
- Generic placeholders, country names alone, currency symbols alone, empty form fields.

Worked example A. Image shows a profile form with text:
  Name: Alex Kumar
  Email: alex@acme.io
  Update profile
Output:
{"regions":[{"category":"person_name","bbox":{"x":0.20,"y":0.10,"w":0.18,"h":0.04},"text":"Alex Kumar","confidence":0.96,"replacement":"[name]"},{"category":"email","bbox":{"x":0.20,"y":0.18,"w":0.22,"h":0.04},"text":"alex@acme.io","confidence":0.95,"replacement":"[email]"}]}

Worked example B. Image shows a VS Code window with a TypeScript file open, tab "formatter.ts", function definitions visible.
Output:
{"regions":[]}

Output ONLY the JSON object. No prose. No markdown fences.`;

export function buildPIIMessages(): Array<{
  role: string;
  content: Array<{ type: string; text?: string }>;
}> {
  return [
    {
      role: 'user',
      content: [
        { type: 'image' },
        { type: 'text', text: PII_SYSTEM_PROMPT },
      ],
    },
  ];
}

export class ModelOutputParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string) {
    super(message);
    this.name = 'ModelOutputParseError';
    this.raw = raw;
  }
}

export function extractJSONObject(raw: string): string {
  let s = raw.trim();
  const fenced = s.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenced) s = fenced[1].trim();

  const start = s.indexOf('{');
  if (start === -1) {
    throw new ModelOutputParseError('No JSON object found in model output', raw);
  }

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\') {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  throw new ModelOutputParseError('Unmatched braces in model output', raw);
}

// Lenient parsing schema for the MODEL's output. category is intentionally
// `string` so that a single invented category ("state", "postal_code") only
// drops that one region instead of failing the whole array. Coordinates also
// accept numbers > 1 here so pixel-leaks survive parsing and get fixed up by
// renormalizeBbox below.
const LooseBbox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
const LooseModelPIIRegion = z.object({
  category: z.string(),
  bbox: LooseBbox,
  text: z.string().optional(),
  confidence: z.number().optional(),
  replacement: z.string().optional(),
});
const LooseModelPIIResponse = z.object({
  regions: z.array(LooseModelPIIRegion),
});

const VALID_CATEGORIES = new Set<PIIRegion['category']>(PIICategory.options);

const DEFAULT_REPLACEMENT: Record<PIIRegion['category'], string> = {
  email: '[email]',
  phone: '[phone]',
  person_name: '[name]',
  street_address: '[address]',
  account_number: '[account]',
  balance: '[balance]',
  api_key: '[key]',
  jwt: '[token]',
  ip_address: '[ip]',
  customer_id: '[id]',
  face: '[face]',
  free_text_secret: '[redacted]',
};

function clamp01(n: number | undefined, fallback: number): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

// If any single bbox coordinate looks like a pixel value (> 1), divide it by
// the matching image dimension. We've seen Gemma 4 mix pixel y with normalized
// x/w/h on the same region, so each coord is checked independently.
function renormalizeBbox(
  bbox: z.infer<typeof LooseBbox>,
  dims: { width: number; height: number } | undefined,
): z.infer<typeof Bbox> {
  if (!dims) {
    return {
      x: clamp01(bbox.x, 0),
      y: clamp01(bbox.y, 0),
      w: clamp01(bbox.w, 0),
      h: clamp01(bbox.h, 0),
    };
  }
  const fix = (v: number, dim: number) => (v > 1 ? v / dim : v);
  return {
    x: clamp01(fix(bbox.x, dims.width), 0),
    y: clamp01(fix(bbox.y, dims.height), 0),
    w: clamp01(fix(bbox.w, dims.width), 0),
    h: clamp01(fix(bbox.h, dims.height), 0),
  };
}

export function parseModelResponse(
  raw: string,
  imageDims?: { width: number; height: number },
): PIIRegion[] {
  if (!raw.trim()) return [];
  const jsonText = extractJSONObject(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new ModelOutputParseError(
      `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}`,
      raw,
    );
  }

  const result = LooseModelPIIResponse.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputParseError(
      `Schema validation failed: ${result.error.message}`,
      raw,
    );
  }

  const out: PIIRegion[] = [];
  for (const r of result.data.regions) {
    if (!VALID_CATEGORIES.has(r.category as PIIRegion['category'])) continue;
    const category = r.category as PIIRegion['category'];
    out.push({
      category,
      bbox: renormalizeBbox(r.bbox, imageDims),
      text: r.text,
      confidence: clamp01(r.confidence, 0.8),
      replacement: r.replacement?.trim() || DEFAULT_REPLACEMENT[category],
    });
  }
  return out;
}
