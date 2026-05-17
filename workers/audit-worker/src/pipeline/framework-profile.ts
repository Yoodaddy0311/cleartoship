// Framework profile shared across the pipeline.
//
// Step04 (ANALYZE_PROJECT_STRUCTURE) populates `frameworkProfile` so downstream
// steps can branch on the actual stack instead of pattern-matching on file
// paths. The detector is deterministic and prefers manifest-based signals
// (package.json / pyproject.toml) before falling back to root config files.

export type FrameworkPrimary =
  | 'nextjs-app'
  | 'nextjs-pages'
  | 'vite-react'
  | 'vite-vue'
  | 'sveltekit'
  | 'remix'
  | 'astro'
  | 'electron'
  | 'react-native'
  | 'expo'
  | 'express'
  | 'fastify'
  | 'nest'
  | 'fastapi'
  | 'django'
  | 'flask'
  | 'unknown';

export type FrameworkLanguage =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'go'
  | 'rust'
  | 'mixed'
  | 'unknown';

export interface FrameworkEvidence {
  file: string;
  signal: string;
}

export interface FrameworkProfile {
  primary: FrameworkPrimary;
  secondary: string[];
  evidence: FrameworkEvidence[];
  language: FrameworkLanguage;
}

export function createEmptyFrameworkProfile(): FrameworkProfile {
  return {
    primary: 'unknown',
    secondary: [],
    evidence: [],
    language: 'unknown',
  };
}

const PRIMARY_TO_LABEL: Record<FrameworkPrimary, string> = {
  'nextjs-app': 'Next.js (App Router)',
  'nextjs-pages': 'Next.js (Pages Router)',
  'vite-react': 'Vite + React',
  'vite-vue': 'Vite + Vue',
  sveltekit: 'SvelteKit',
  remix: 'Remix',
  astro: 'Astro',
  electron: 'Electron',
  'react-native': 'React Native',
  expo: 'Expo',
  express: 'Express',
  fastify: 'Fastify',
  nest: 'NestJS',
  fastapi: 'FastAPI',
  django: 'Django',
  flask: 'Flask',
  unknown: 'Unknown',
};

export function primaryLabel(primary: FrameworkPrimary): string {
  return PRIMARY_TO_LABEL[primary];
}
