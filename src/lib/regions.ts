import type { PIIRegion } from '../schema';

export type RegionSource = 'model' | 'regex' | 'manual';

export type ClientRegion = PIIRegion & {
  id: string;
  source: RegionSource;
  locked?: boolean;
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `r${counter.toString(36)}-${Date.now().toString(36)}`;
}

export function toClientRegion(r: PIIRegion, source: RegionSource = 'model'): ClientRegion {
  return { ...r, id: nextId(), source };
}

export function toClientRegions(regions: PIIRegion[]): ClientRegion[] {
  // We can't tell model vs regex apart from the merged output yet; the worker
  // payload doesn't carry that. For now everything is marked 'model' and the
  // detail panel chip shows Model+Regex states based on confidence === 1.
  return regions.map((r) => ({
    ...r,
    id: nextId(),
    source: (r.confidence >= 1 ? 'regex' : 'model') as RegionSource,
  }));
}
