// ANALYZE_PROJECT_STRUCTURE
//
// Reads the cloned repo's manifest files (package.json / pyproject.toml /
// requirements.txt) plus root-level config files to produce a deterministic
// `FrameworkProfile`. The previous implementation only knew 7 stacks via file
// glob heuristics on the cloned repo's file tree (populated by step03), which made non-Next.js repos effectively
// unanalysable. This version covers 16 frameworks across 4 languages.
//
// Contract:
//   - state.frameworkProfile is always set (never null) after this step runs.
//   - state.techStack is rebuilt from `primary` + `secondary` for backwards
//     compatibility with the report header.
//   - All filesystem reads are wrapped in try/catch — missing or malformed
//     manifests degrade gracefully to `primary: 'unknown'`.

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Step } from './index.js';
import {
  createEmptyFrameworkProfile,
  primaryLabel,
  type FrameworkEvidence,
  type FrameworkLanguage,
  type FrameworkPrimary,
  type FrameworkProfile,
} from '../framework-profile.js';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface ManifestSignals {
  deps: Set<string>;
  scripts: string;
  hasFile: (relPath: string) => boolean;
  hasDir: (relPath: string) => boolean;
}

const SECONDARY_DEP_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['@trpc/server', 'tRPC'],
  ['@trpc/client', 'tRPC'],
  ['graphql-yoga', 'GraphQL Yoga'],
  ['@apollo/server', 'Apollo Server'],
  ['apollo-server', 'Apollo Server'],
  ['prisma', 'Prisma'],
  ['@prisma/client', 'Prisma'],
  ['drizzle-orm', 'Drizzle'],
  ['typeorm', 'TypeORM'],
  ['mongoose', 'Mongoose'],
  ['sequelize', 'Sequelize'],
  ['tailwindcss', 'Tailwind CSS'],
  ['firebase', 'Firebase'],
  ['firebase-admin', 'Firebase Admin'],
  ['@supabase/supabase-js', 'Supabase'],
  ['next-auth', 'NextAuth'],
  ['@auth/core', 'Auth.js'],
  ['zod', 'Zod'],
  ['react-query', 'React Query'],
  ['@tanstack/react-query', 'TanStack Query'],
  ['redux', 'Redux'],
  ['zustand', 'Zustand'],
  ['vitest', 'Vitest'],
  ['jest', 'Jest'],
  ['playwright', 'Playwright'],
  ['cypress', 'Cypress'],
];

async function safeReadJson<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function safeReadText(filePath: string): Promise<string | null> {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

function collectDeps(pkg: PackageJson | null): Set<string> {
  const out = new Set<string>();
  if (!pkg) return out;
  for (const block of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
    if (!block) continue;
    for (const name of Object.keys(block)) out.add(name);
  }
  return out;
}

function joinScripts(pkg: PackageJson | null): string {
  if (!pkg?.scripts) return '';
  return Object.values(pkg.scripts).join('\n');
}

function detectLanguage(
  deps: Set<string>,
  hasTsConfig: boolean,
  hasPyProject: boolean,
  hasRequirements: boolean,
  hasGoMod: boolean,
  hasCargoToml: boolean
): FrameworkLanguage {
  const jsLike = deps.size > 0;
  const pyLike = hasPyProject || hasRequirements;
  const hits: FrameworkLanguage[] = [];
  if (jsLike) hits.push(hasTsConfig || deps.has('typescript') ? 'typescript' : 'javascript');
  if (pyLike) hits.push('python');
  if (hasGoMod) hits.push('go');
  if (hasCargoToml) hits.push('rust');
  if (hits.length === 0) return 'unknown';
  if (hits.length === 1) return hits[0]!;
  return 'mixed';
}

function detectPrimaryFromJs(
  signals: ManifestSignals,
  evidence: FrameworkEvidence[]
): FrameworkPrimary {
  const { deps, hasFile, hasDir } = signals;

  // Order matters — more specific frameworks first.
  if (deps.has('next')) {
    if (hasDir('app') || hasDir('src/app')) {
      evidence.push({ file: 'package.json', signal: 'next + app/ directory' });
      return 'nextjs-app';
    }
    if (hasDir('pages') || hasDir('src/pages')) {
      evidence.push({ file: 'package.json', signal: 'next + pages/ directory' });
      return 'nextjs-pages';
    }
    evidence.push({ file: 'package.json', signal: 'next (router undetermined → app default)' });
    return 'nextjs-app';
  }
  if (deps.has('@sveltejs/kit')) {
    evidence.push({ file: 'package.json', signal: '@sveltejs/kit dependency' });
    return 'sveltekit';
  }
  if (deps.has('remix') || deps.has('@remix-run/react') || deps.has('@remix-run/node')) {
    evidence.push({ file: 'package.json', signal: '@remix-run/* dependency' });
    return 'remix';
  }
  if (deps.has('astro')) {
    evidence.push({ file: 'package.json', signal: 'astro dependency' });
    return 'astro';
  }
  if (deps.has('expo')) {
    evidence.push({ file: 'package.json', signal: 'expo dependency' });
    return 'expo';
  }
  if (deps.has('react-native')) {
    evidence.push({ file: 'package.json', signal: 'react-native dependency' });
    return 'react-native';
  }
  if (deps.has('electron')) {
    evidence.push({ file: 'package.json', signal: 'electron dependency' });
    return 'electron';
  }
  if (deps.has('vite')) {
    if (deps.has('react') || deps.has('@vitejs/plugin-react') || deps.has('@vitejs/plugin-react-swc')) {
      evidence.push({ file: 'package.json', signal: 'vite + react plugin' });
      return 'vite-react';
    }
    if (deps.has('vue') || deps.has('@vitejs/plugin-vue')) {
      evidence.push({ file: 'package.json', signal: 'vite + vue plugin' });
      return 'vite-vue';
    }
  }
  if (deps.has('@nestjs/core')) {
    evidence.push({ file: 'package.json', signal: '@nestjs/core dependency' });
    return 'nest';
  }
  if (deps.has('fastify')) {
    evidence.push({ file: 'package.json', signal: 'fastify dependency' });
    return 'fastify';
  }
  if (deps.has('express')) {
    evidence.push({ file: 'package.json', signal: 'express dependency' });
    return 'express';
  }

  // Root config file fallbacks (no recognised dep but config present).
  if (hasFile('next.config.js') || hasFile('next.config.mjs') || hasFile('next.config.ts')) {
    evidence.push({ file: 'next.config.*', signal: 'root next.config without next dep' });
    return hasDir('app') ? 'nextjs-app' : 'nextjs-pages';
  }
  if (hasFile('vite.config.js') || hasFile('vite.config.ts') || hasFile('vite.config.mjs')) {
    evidence.push({ file: 'vite.config.*', signal: 'root vite.config without vite dep' });
    return 'vite-react';
  }

  return 'unknown';
}

function detectPrimaryFromPython(
  pyText: string,
  reqText: string,
  evidence: FrameworkEvidence[]
): FrameworkPrimary {
  const haystack = `${pyText}\n${reqText}`.toLowerCase();
  if (/(^|[^\w])fastapi([^\w]|$)/.test(haystack)) {
    evidence.push({ file: pyText ? 'pyproject.toml' : 'requirements.txt', signal: 'fastapi listed' });
    return 'fastapi';
  }
  if (/(^|[^\w])django([^\w]|$)/.test(haystack)) {
    evidence.push({ file: pyText ? 'pyproject.toml' : 'requirements.txt', signal: 'django listed' });
    return 'django';
  }
  if (/(^|[^\w])flask([^\w]|$)/.test(haystack)) {
    evidence.push({ file: pyText ? 'pyproject.toml' : 'requirements.txt', signal: 'flask listed' });
    return 'flask';
  }
  return 'unknown';
}

function buildSecondary(deps: Set<string>): string[] {
  const out = new Set<string>();
  for (const [dep, label] of SECONDARY_DEP_LABELS) {
    if (deps.has(dep)) out.add(label);
  }
  return [...out];
}

function profileToTechStack(profile: FrameworkProfile): string[] {
  const out: string[] = [];
  if (profile.primary !== 'unknown') out.push(primaryLabel(profile.primary));
  for (const s of profile.secondary) {
    if (!out.includes(s)) out.push(s);
  }
  if (profile.language === 'typescript') {
    if (!out.includes('TypeScript')) out.push('TypeScript');
  } else if (profile.language === 'javascript') {
    if (!out.includes('Node.js')) out.push('Node.js');
  } else if (profile.language === 'python') {
    if (!out.includes('Python')) out.push('Python');
  } else if (profile.language === 'go') {
    if (!out.includes('Go')) out.push('Go');
  } else if (profile.language === 'rust') {
    if (!out.includes('Rust')) out.push('Rust');
  }
  return out;
}

export async function detectFrameworkProfile(clonePath: string): Promise<FrameworkProfile> {
  const profile = createEmptyFrameworkProfile();
  const evidence: FrameworkEvidence[] = [];

  const pkg = await safeReadJson<PackageJson>(path.join(clonePath, 'package.json'));
  const pyprojectText = (await safeReadText(path.join(clonePath, 'pyproject.toml'))) ?? '';
  const requirementsText = (await safeReadText(path.join(clonePath, 'requirements.txt'))) ?? '';
  const appJsonPath = path.join(clonePath, 'app.json');
  const hasAppJson = await pathExists(appJsonPath);
  const hasTsConfig = await pathExists(path.join(clonePath, 'tsconfig.json'));
  const hasGoMod = await pathExists(path.join(clonePath, 'go.mod'));
  const hasCargoToml = await pathExists(path.join(clonePath, 'Cargo.toml'));

  const deps = collectDeps(pkg);

  // Cache existence checks for root files / dirs used during detection.
  const fileCache = new Map<string, boolean>();
  const dirCache = new Map<string, boolean>();
  const hasFile = (relPath: string): boolean => {
    const cached = fileCache.get(relPath);
    if (cached !== undefined) return cached;
    return false;
  };
  const hasDir = (relPath: string): boolean => {
    const cached = dirCache.get(relPath);
    if (cached !== undefined) return cached;
    return false;
  };

  // Pre-warm caches for files/dirs the detector cares about.
  const filesToCheck = [
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'vite.config.js',
    'vite.config.ts',
    'vite.config.mjs',
  ];
  for (const f of filesToCheck) {
    fileCache.set(f, await pathExists(path.join(clonePath, f)));
  }
  const dirsToCheck = ['app', 'src/app', 'pages', 'src/pages'];
  for (const d of dirsToCheck) {
    let isDir = false;
    try {
      const stat = await fsp.stat(path.join(clonePath, d));
      isDir = stat.isDirectory();
    } catch {
      isDir = false;
    }
    dirCache.set(d, isDir);
  }

  const signals: ManifestSignals = {
    deps,
    scripts: joinScripts(pkg),
    hasFile,
    hasDir,
  };

  // JS/TS family first. Always consult the detector — it can also pick up
  // signals from root config files (next.config.*, vite.config.*) when the
  // package.json is missing or doesn't list the framework as a dep.
  let primary: FrameworkPrimary = detectPrimaryFromJs(signals, evidence);

  // Python family (only consult if JS detection inconclusive OR mixed repo).
  if (primary === 'unknown' && (pyprojectText || requirementsText)) {
    primary = detectPrimaryFromPython(pyprojectText, requirementsText, evidence);
  }

  // Expo special-case: app.json + expo dep usually already caught above; guard
  // against an Expo bare-workflow repo where deps weren't found but app.json is.
  if (primary === 'unknown' && hasAppJson) {
    const appJson = await safeReadJson<{ expo?: unknown }>(appJsonPath);
    if (appJson && typeof appJson.expo === 'object' && appJson.expo !== null) {
      evidence.push({ file: 'app.json', signal: 'expo block present' });
      primary = 'expo';
    }
  }

  profile.primary = primary;
  profile.secondary = buildSecondary(deps);
  profile.evidence = evidence;
  profile.language = detectLanguage(
    deps,
    hasTsConfig,
    Boolean(pyprojectText),
    Boolean(requirementsText),
    hasGoMod,
    hasCargoToml
  );

  return profile;
}

export const step04AnalyzeProjectStructure: Step = {
  step: 'ANALYZE_PROJECT_STRUCTURE',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      const empty = createEmptyFrameworkProfile();
      state.frameworkProfile = empty;
      state.techStack = profileToTechStack(empty);
      ctx.log('warn', 'Project structure: no clone path; skipping framework detection', {});
      return;
    }

    const profile = await detectFrameworkProfile(ctx.clonePath);
    state.frameworkProfile = profile;
    state.techStack = profileToTechStack(profile);
    ctx.log('info', 'Project structure analyzed', {
      primary: profile.primary,
      secondary: profile.secondary,
      language: profile.language,
      evidenceCount: profile.evidence.length,
      techStack: state.techStack,
    });
  },
};
