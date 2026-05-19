import { z } from 'zod';

export const PIICategory = z.enum([
  'email',
  'phone',
  'person_name',
  'street_address',
  'account_number',
  'balance',
  'api_key',
  'jwt',
  'ip_address',
  'customer_id',
  'face',
  'free_text_secret',
]);
export type PIICategory = z.infer<typeof PIICategory>;

export const Bbox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Bbox = z.infer<typeof Bbox>;

export const PIIRegion = z.object({
  category: PIICategory,
  bbox: Bbox,
  text: z.string().optional(),
  confidence: z.number().min(0).max(1),
  replacement: z.string(),
});
export type PIIRegion = z.infer<typeof PIIRegion>;

export const PIIResponse = z.object({
  regions: z.array(PIIRegion),
});
export type PIIResponse = z.infer<typeof PIIResponse>;

export type RegionSource = 'model' | 'regex' | 'merged';
