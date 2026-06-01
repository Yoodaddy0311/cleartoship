// Read `compilerOptions.paths` + `baseUrl` from a repo's tsconfig.json (or
// jsconfig.json) so resolve-import can map alias specifiers like `@/lib/x` to
// real files. tsconfig is technically JSONC, so we strip `//` + `/* */`
// comments and tolerate trailing commas before parsing — defensively, never
// throwing: an unreadable/unparseable config falls back to the default alias
// map (`@/*` → src/ then repo root).
//
// Pure-ish: the only IO is reading the config file from `clonePath`. Returns a
// plain immutable snapshot; callers never mutate it.

import { promises as fsp } from 'node:fs';
import path from 'node:path';

export interface PathAliases {
  /** `compilerOptions.baseUrl` (relative to repo root) or '.' when unset. */
  readonly baseUrl: string;
  /** `compilerOptions.paths` — alias pattern → list of target patterns. */
  readonly paths: Readonly<Record<string, ReadonlyArray<string>>>;
  /** `true` when no config was found/parsed and the default map is in use. */
  readonly isDefault: boolean;
}

/** Default Next.js-style alias used when a repo has no tsconfig/jsconfig. */
const DEFAULT_ALIASES: PathAliases = {
  baseUrl: '.',
  // `@/*` → both `src/*` and repo-root `*`; resolve-import tries each in order.
  paths: { '@/*': ['./src/*', './*'] },
  isDefault: true,
};

/**
 * Strip JSONC artifacts (line + block comments, trailing commas) so the result
 * is parseable by `JSON.parse`. Conservative: operates on a best-effort basis
 * and the caller always has a try/catch fallback.
 */
function stripJsonc(raw: string): string {
  // Remove block comments, then line comments, then trailing commas.
  const noBlock = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const noLine = noBlock.replace(/(^|[^:])\/\/[^\n\r]*/g, '$1');
  return noLine.replace(/,(\s*[}\]])/g, '$1');
}

interface RawConfig {
  compilerOptions?: {
    baseUrl?: unknown;
    paths?: unknown;
  };
}

function normalizePaths(raw: unknown): Record<string, string[]> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [pattern, targets] of Object.entries(raw as Record<string, unknown>)) {
    if (Array.isArray(targets)) {
      const list = targets.filter((t): t is string => typeof t === 'string');
      if (list.length > 0) out[pattern] = list;
    }
  }
  return out;
}

async function readConfig(clonePath: string, filename: string): Promise<PathAliases | null> {
  try {
    const text = await fsp.readFile(path.join(clonePath, filename), 'utf8');
    const parsed = JSON.parse(stripJsonc(text)) as RawConfig;
    const co = parsed.compilerOptions ?? {};
    const paths = normalizePaths(co.paths);
    const baseUrl = typeof co.baseUrl === 'string' ? co.baseUrl : '.';
    // A config with neither paths nor a baseUrl gives us nothing to resolve
    // with — let the caller fall through to the default map.
    if (Object.keys(paths).length === 0 && co.baseUrl === undefined) {
      return null;
    }
    return { baseUrl, paths, isDefault: false };
  } catch {
    return null;
  }
}

/**
 * Load alias config from `clonePath`. Tries tsconfig.json then jsconfig.json;
 * returns the default alias map when neither yields a usable config.
 */
export async function loadPathAliases(clonePath: string): Promise<PathAliases> {
  if (!clonePath) return DEFAULT_ALIASES;
  const fromTs = await readConfig(clonePath, 'tsconfig.json');
  if (fromTs) return fromTs;
  const fromJs = await readConfig(clonePath, 'jsconfig.json');
  if (fromJs) return fromJs;
  return DEFAULT_ALIASES;
}
