import type { Config } from 'tailwindcss';

// Tailwind v4: design tokens live in `app/globals.css` via @theme.
// This file only declares content paths and (optional) plugins.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
