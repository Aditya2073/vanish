import { z } from 'zod';
import { Bbox, PIICategory } from './schema';
import type { PIIRegion } from './schema';

export const PII_SYSTEM_PROMPT = `You are a PII detector for screenshots. Return ONLY one JSON object with this shape:
{"regions":[{"category":"email","bbox":{"x":0.12,"y":0.34,"w":0.20,"h":0.04},"text":"alice@example.com","confidence":0.95,"replacement":"[email]"}]}

Every region MUST include all five keys: category, bbox, text, confidence, replacement. Coordinates are normalized 0..1 of image width and height with origin top-left. confidence is 0..1. "text" is the literal visible text inside the bbox, truncated to at most 80 characters. "replacement" is a short drop-in redaction like "[email]" or "[phone]".

If no PII is present, return exactly: {"regions":[]}

Categories (use the strings verbatim):
- email: an email address.
- phone: a phone number, US or international.
- person_name: a real person's first and/or last name.
- street_address: a postal or street address.
- account_number: a digit sequence (6+) acting as a bank, customer, or order id.
- balance: a currency amount tied to a person or account.
- api_key: an API key, access token, secret, or credential string (e.g. AKIA..., ghp_..., sk_live_...).
- jwt: a JSON Web Token (three base64 segments separated by dots, usually starting with "eyJ").
- ip_address: an IPv4 or IPv6 address.
- customer_id: an alphanumeric customer / user / account identifier (not just digits).
- face: a visible human face.
- free_text_secret: any other clearly sensitive text not covered above.

NOT PII — do not emit regions for these even if they look "code-like":
- Source code, function names, variable names, type annotations, language keywords.
- UI chrome: button labels, menu items, breadcrumbs, tab titles, file paths, app names.
- Field labels themselves (e.g. the word "Email", "Name", "Address" without a value).
- Generic placeholders, currency symbols alone, or empty form fields.

Worked example. Input image shows the text:
  Name: Alex Kumar
  Email: alex@acme.io
  Update profile
Expected output:
{"regions":[{"category":"person_name","bbox":{"x":0.20,"y":0.10,"w":0.18,"h":0.04},"text":"Alex Kumar","confidence":0.96,"replacement":"[name]"},{"category":"email","bbox":{"x":0.20,"y":0.18,"w":0.22,"h":0.04},"text":"alex@acme.io","confidence":0.95,"replacement":"[email]"}]}

Note: "Name:", "Email:", and "Update profile" produced no regions because they are labels and UI chrome, not PII.

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

// Lenient schema applied to the MODEL's output specifically. Gemma 4 sometimes
// drops `replacement` or `confidence`; we normalize those into the canonical
// PIIRegion shape below instead of failing the whole pipeline.
const ModelPIIRegion = z.object({
  category: PIICategory,
  bbox: Bbox,
  text: z.string().optional(),
  confidence: z.number().optional(),
  replacement: z.string().optional(),
});
const ModelPIIResponse = z.object({
  regions: z.array(ModelPIIRegion),
});

const DEFAULT_REPLACEMENT: Record<z.infer<typeof PIICategory>, string> = {
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

export function parseModelResponse(raw: string): PIIRegion[] {
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

  const result = ModelPIIResponse.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputParseError(
      `Schema validation failed: ${result.error.message}`,
      raw,
    );
  }

  return result.data.regions.map<PIIRegion>((r) => ({
    category: r.category,
    bbox: r.bbox,
    text: r.text,
    confidence: clamp01(r.confidence, 0.8),
    replacement: r.replacement?.trim() || DEFAULT_REPLACEMENT[r.category],
  }));
}
