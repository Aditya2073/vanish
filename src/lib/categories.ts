import type { PIICategory } from '../schema';

export type CategoryMeta = {
  category: PIICategory;
  label: string;
  shortLabel: string;
  cssVar: string;
  defaultReplacement: string;
};

// Single source of truth. Order here is the canonical render order in the rail
// and chip strip.
export const CATEGORY_META: Record<PIICategory, CategoryMeta> = {
  email:            { category: 'email',            label: 'Email',           shortLabel: 'Email',    cssVar: 'var(--cat-email)', defaultReplacement: '[email]' },
  phone:            { category: 'phone',            label: 'Phone',           shortLabel: 'Phone',    cssVar: 'var(--cat-phone)', defaultReplacement: '[phone]' },
  person_name:      { category: 'person_name',      label: 'Person name',     shortLabel: 'Name',     cssVar: 'var(--cat-name)',  defaultReplacement: '[name]' },
  street_address:   { category: 'street_address',   label: 'Address',         shortLabel: 'Address',  cssVar: 'var(--cat-addr)',  defaultReplacement: '[address]' },
  account_number:   { category: 'account_number',   label: 'Account number',  shortLabel: 'Acct',     cssVar: 'var(--cat-acct)',  defaultReplacement: '[account]' },
  balance:          { category: 'balance',          label: 'Balance',         shortLabel: 'Balance',  cssVar: 'var(--cat-bal)',   defaultReplacement: '[balance]' },
  api_key:          { category: 'api_key',          label: 'API key',         shortLabel: 'Key',      cssVar: 'var(--cat-key)',   defaultReplacement: '[key]' },
  jwt:              { category: 'jwt',              label: 'JWT',             shortLabel: 'JWT',      cssVar: 'var(--cat-jwt)',   defaultReplacement: '[token]' },
  ip_address:       { category: 'ip_address',       label: 'IP address',      shortLabel: 'IP',       cssVar: 'var(--cat-ip)',    defaultReplacement: '[ip]' },
  customer_id:      { category: 'customer_id',      label: 'Customer ID',     shortLabel: 'Cust ID',  cssVar: 'var(--cat-cust)',  defaultReplacement: '[id]' },
  face:             { category: 'face',             label: 'Face',            shortLabel: 'Face',     cssVar: 'var(--cat-face)',  defaultReplacement: '[face]' },
  free_text_secret: { category: 'free_text_secret', label: 'Secret',          shortLabel: 'Secret',   cssVar: 'var(--cat-sec)',   defaultReplacement: '[redacted]' },
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_META) as PIICategory[];

export function categoryColor(cat: PIICategory): string {
  return CATEGORY_META[cat].cssVar;
}

export function categoryLabel(cat: PIICategory): string {
  return CATEGORY_META[cat].label;
}
