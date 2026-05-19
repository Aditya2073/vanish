import { PIIResponse } from './schema';
import type { PIIRegion } from './schema';

export const PII_SYSTEM_PROMPT = `You are an expert at detecting personally identifiable information (PII) and sensitive secrets in screenshots.

Return ONLY a JSON object with this exact shape (no prose, no markdown fences):
{"regions":[{"category":"email","bbox":{"x":0.12,"y":0.34,"w":0.20,"h":0.04},"text":"alice@example.com","confidence":0.95,"replacement":"[email]"}]}

Rules:
- bbox uses coordinates normalized to 0..1 of image width and height, with origin at the top-left.
- confidence is a number between 0 and 1.
- "text" is what the region appears to say (best-effort reading).
- "replacement" is a sensible redaction string the user can drop in.
- If no PII is present, return exactly: {"regions":[]}

Use these category strings exactly:
- email: an email address.
- phone: a phone number, US or international, with or without country code.
- person_name: a human first and/or last name in a context implying identity.
- street_address: a postal address or street location.
- account_number: any sequence of 6+ digits acting as a bank, customer, or order identifier.
- balance: a monetary balance or currency amount tied to a specific account or person.
- api_key: an API key, access token, secret, or credential string.
- jwt: a JSON Web Token (three base64 segments separated by dots, usually starting with "eyJ").
- ip_address: an IPv4 or IPv6 address.
- customer_id: an internal customer, user, or account identifier (alphanumeric, not just digits).
- face: a clearly visible human face in the image.
- free_text_secret: any other sensitive text not covered above.

Output ONLY the JSON object. No prose. No markdown.`;

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
  // Strip ```json ... ``` or ``` ... ``` fences if the model added them.
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
  const result = PIIResponse.safeParse(parsed);
  if (!result.success) {
    throw new ModelOutputParseError(
      `Schema validation failed: ${result.error.message}`,
      raw,
    );
  }
  return result.data.regions;
}
