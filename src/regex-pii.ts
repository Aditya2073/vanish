import type { Bbox, PIICategory, PIIRegion } from './schema';

export type PixelBbox = { x: number; y: number; w: number; h: number };

export type OCRWord = {
  text: string;
  bbox: PixelBbox;
};

export type OCRPage = {
  text: string;
  words: OCRWord[];
  width: number;
  height: number;
};

type RegexRule = {
  category: PIICategory;
  pattern: RegExp;
  replacement: string;
};

// Order matters for the merger: more specific patterns first so they win when
// two regexes happen to cover the same text.
const RULES: RegexRule[] = [
  {
    category: 'email',
    pattern: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    replacement: '[email]',
  },
  {
    category: 'jwt',
    pattern: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g,
    replacement: '[jwt]',
  },
  {
    category: 'api_key',
    pattern: /AKIA[0-9A-Z]{16}/g,
    replacement: '[aws-access-key]',
  },
  {
    category: 'api_key',
    pattern: /ghp_[A-Za-z0-9]{36}/g,
    replacement: '[github-pat]',
  },
  {
    category: 'api_key',
    pattern: /sk_(?:live|test)_[A-Za-z0-9]+/g,
    replacement: '[stripe-key]',
  },
  {
    category: 'api_key',
    // AWS secret access key: 40 base64-ish chars, not bordered by more base64 chars.
    pattern: /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+])/g,
    replacement: '[aws-secret]',
  },
  {
    category: 'ip_address',
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    replacement: '[ip]',
  },
  {
    category: 'ip_address',
    // Simplified IPv6: 2-8 hex groups separated by colons. Catches full and the
    // common shortened forms without trying to be RFC-perfect.
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){2,7}[0-9a-fA-F]{1,4}\b/g,
    replacement: '[ip]',
  },
  {
    category: 'phone',
    // International, starting with +
    pattern: /\+\d[\d\s.\-()]{6,18}\d/g,
    replacement: '[phone]',
  },
  {
    category: 'phone',
    // US 10-digit, allowing common separators
    pattern: /(?<!\d)\(?\d{3}\)?[\s.\-]?\d{3}[\s.\-]?\d{4}(?!\d)/g,
    replacement: '[phone]',
  },
];

type RebuiltText = {
  text: string;
  ranges: Array<[number, number]>;
};

function rebuildText(words: OCRWord[]): RebuiltText {
  let text = '';
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0) text += ' ';
    const start = text.length;
    text += words[i].text;
    ranges.push([start, text.length]);
  }
  return { text, ranges };
}

function coverWords(
  ranges: Array<[number, number]>,
  matchStart: number,
  matchEnd: number,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < ranges.length; i++) {
    const [s, e] = ranges[i];
    if (s < matchEnd && e > matchStart) out.push(i);
  }
  return out;
}

function unionBbox(words: OCRWord[], indices: number[]): PixelBbox | null {
  if (indices.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const i of indices) {
    const b = words[i].bbox;
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function normalizeBbox(b: PixelBbox, W: number, H: number): Bbox {
  return {
    x: clamp01(b.x / W),
    y: clamp01(b.y / H),
    w: clamp01(b.w / W),
    h: clamp01(b.h / H),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function detectRegexPII(page: OCRPage): PIIRegion[] {
  if (!page.text || page.words.length === 0) return [];
  const rebuilt = rebuildText(page.words);
  const sources: Array<{ text: string; mapWord: (idx: number) => number | null }> = [
    {
      text: rebuilt.text,
      mapWord: (i) => i,
    },
    {
      text: page.text,
      mapWord: () => null,
    },
  ];

  const seen = new Set<string>();
  const regions: PIIRegion[] = [];

  for (const rule of RULES) {
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);
    for (const source of sources) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(source.text)) !== null) {
        const matchText = m[0];
        const key = `${rule.category}:${matchText}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Map back to words using the rebuilt text (the second source has no
        // word mapping; we still record the match but bbox becomes a thin
        // fallback at the top of the image).
        let bboxPx: PixelBbox | null = null;
        if (source === sources[0]) {
          const indices = coverWords(rebuilt.ranges, m.index, m.index + matchText.length);
          bboxPx = unionBbox(page.words, indices);
        }
        const bbox = bboxPx
          ? normalizeBbox(bboxPx, page.width, page.height)
          : { x: 0, y: 0, w: 0, h: 0 };

        regions.push({
          category: rule.category,
          bbox,
          text: matchText,
          confidence: 1.0,
          replacement: rule.replacement,
        });
      }
    }
  }

  return regions;
}
