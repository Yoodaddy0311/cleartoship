import type { Config } from 'tailwindcss';

// Tailwind v4: theme tokens live in app/globals.css :root.
// This config maps those CSS variables to Tailwind utility classes so that
// `bg-mk-bg`, `text-app-fg-muted`, `bg-sev-p0`, etc. resolve correctly.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx,mdx}',
    './components/**/*.{ts,tsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Marketing surface
        'mk-bg': 'var(--mk-bg)',
        'mk-bg-soft': 'var(--mk-bg-soft)',
        'mk-fg': 'var(--mk-fg)',
        'mk-fg-muted': 'var(--mk-fg-muted)',
        'mk-accent': 'var(--mk-accent)',
        'mk-accent-2': 'var(--mk-accent-2)',

        // App surface
        'app-bg': 'var(--app-bg)',
        'app-surface': 'var(--app-surface)',
        'app-sidebar-bg': 'var(--app-sidebar-bg)',
        'app-sidebar-fg': 'var(--app-sidebar-fg)',
        'app-sidebar-active': 'var(--app-sidebar-active)',
        'app-fg': 'var(--app-fg)',
        'app-fg-muted': 'var(--app-fg-muted)',
        'app-border': 'var(--app-border)',
        'app-chip-bg': 'var(--app-chip-bg)',

        // Severity
        'sev-p0': 'var(--sev-p0)',
        'sev-p1': 'var(--sev-p1)',
        'sev-p2': 'var(--sev-p2)',
        'sev-p3': 'var(--sev-p3)',
      },
      borderRadius: {
        'mk': 'var(--mk-radius)',
        'mk-pill': 'var(--mk-radius-pill)',
        'app': 'var(--app-radius)',
      },
      boxShadow: {
        'mk': 'var(--mk-shadow)',
        'app-card': 'var(--app-shadow-card)',
      },
      fontFamily: {
        'display': ['var(--mk-font-display)'],
      },
      fontSize: {
        'hero': 'var(--mk-hero-size)',
        'md': ['1rem', { lineHeight: '1.6' }],
        'display-sm': ['1.5rem', { lineHeight: '1.3', fontWeight: '600' }],
        'display-md': ['2rem', { lineHeight: '1.25', fontWeight: '600' }],
        'display-lg': ['2.75rem', { lineHeight: '1.15', fontWeight: '600' }],
      },
      backgroundImage: {
        'mk-gradient': 'var(--mk-gradient)',
      },
      maxWidth: {
        'container': '1200px',
      },
    },
  },
  plugins: [],
};

export default config;
