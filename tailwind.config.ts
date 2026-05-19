import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Surfaces & ink — mirrored from design/Vanish.html :root.
        bg: 'var(--bg)',
        'page-bg': 'var(--page-bg)',
        'surface-1': 'var(--surface-1)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        'text-1': 'var(--text-1)',
        'text-2': 'var(--text-2)',
        'text-3': 'var(--text-3)',
        lime: 'var(--lime)',
        'lime-ink': 'var(--lime-ink)',

        // Category colors. Names match the design's --cat-* tokens.
        'cat-email': 'var(--cat-email)',
        'cat-phone': 'var(--cat-phone)',
        'cat-name': 'var(--cat-name)',
        'cat-addr': 'var(--cat-addr)',
        'cat-acct': 'var(--cat-acct)',
        'cat-bal': 'var(--cat-bal)',
        'cat-key': 'var(--cat-key)',
        'cat-jwt': 'var(--cat-jwt)',
        'cat-ip': 'var(--cat-ip)',
        'cat-cust': 'var(--cat-cust)',
        'cat-face': 'var(--cat-face)',
        'cat-sec': 'var(--cat-sec)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Mirror the design scale: 11 / 12 / 13 / 14 / 16 / 20 / 22 / 32
        '11': ['11px', { lineHeight: '1' }],
        '13': ['13px', { lineHeight: '1.4' }],
      },
      letterSpacing: {
        body: '-0.01em',
        head: '-0.02em',
        mark: '-0.04em',
      },
      borderRadius: {
        // Design uses small radii everywhere; 4px is the canonical button radius.
        DEFAULT: '4px',
      },
      keyframes: {
        scanline: {
          '0%':   { width: '2px',  opacity: '0.3' },
          '50%':  { width: '60%',  opacity: '0.8' },
          '100%': { width: '2px',  opacity: '0.3' },
        },
      },
      animation: {
        'scanline': 'scanline 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
