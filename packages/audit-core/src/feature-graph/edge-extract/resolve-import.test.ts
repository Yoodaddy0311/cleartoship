import { describe, it, expect } from 'vitest';
import { resolveImport } from './resolve-import.js';
import type { PathAliases } from './load-path-aliases.js';

const DEFAULT_ALIASES: PathAliases = {
  baseUrl: '.',
  paths: { '@/*': ['./src/*', './*'] },
  isDefault: true,
};

const fileSet = (...files: string[]) => new Set(files);

describe('resolveImport — relative specifiers', () => {
  it('resolves ./sibling with an implicit .tsx extension', () => {
    const files = fileSet('app/dashboard/page.tsx', 'app/dashboard/Chart.tsx');
    expect(
      resolveImport('app/dashboard/page.tsx', './Chart', DEFAULT_ALIASES, files),
    ).toBe('app/dashboard/Chart.tsx');
  });

  it('resolves ../parent across directories', () => {
    const files = fileSet('app/dashboard/page.tsx', 'app/lib/format.ts');
    expect(
      resolveImport('app/dashboard/page.tsx', '../lib/format', DEFAULT_ALIASES, files),
    ).toBe('app/lib/format.ts');
  });

  it('resolves a directory import to its index file', () => {
    const files = fileSet('app/page.tsx', 'app/components/index.ts');
    expect(
      resolveImport('app/page.tsx', './components', DEFAULT_ALIASES, files),
    ).toBe('app/components/index.ts');
  });

  it('honours an explicit extension in the specifier', () => {
    const files = fileSet('app/page.tsx', 'app/data.json');
    expect(
      resolveImport('app/page.tsx', './data.json', DEFAULT_ALIASES, files),
    ).toBe('app/data.json');
  });

  it('returns null on a miss (honest — no fabrication)', () => {
    const files = fileSet('app/page.tsx');
    expect(
      resolveImport('app/page.tsx', './does-not-exist', DEFAULT_ALIASES, files),
    ).toBeNull();
  });

  it('returns null for bare package imports', () => {
    const files = fileSet('app/page.tsx');
    expect(resolveImport('app/page.tsx', 'react', DEFAULT_ALIASES, files)).toBeNull();
    expect(
      resolveImport('app/page.tsx', '@tanstack/react-query', DEFAULT_ALIASES, files),
    ).toBeNull();
  });
});

describe('resolveImport — alias specifiers', () => {
  it('resolves @/components/* via a configured tsconfig path', () => {
    const aliases: PathAliases = {
      baseUrl: '.',
      paths: { '@/*': ['./src/*'] },
      isDefault: false,
    };
    const files = fileSet('app/page.tsx', 'src/components/ui/button.tsx');
    expect(
      resolveImport('app/page.tsx', '@/components/ui/button', aliases, files),
    ).toBe('src/components/ui/button.tsx');
  });

  it('ladders @/* fallback to repo root when src/ does not contain the file', () => {
    // Default alias map lists ./src/* THEN ./* — taxonomy-style repos put
    // components at the repo root, not under src/.
    const files = fileSet('app/page.tsx', 'components/ui/button.tsx');
    expect(
      resolveImport('app/page.tsx', '@/components/ui/button', DEFAULT_ALIASES, files),
    ).toBe('components/ui/button.tsx');
  });

  it('resolves a non-@ alias (~/*)', () => {
    const aliases: PathAliases = {
      baseUrl: '.',
      paths: { '~/*': ['./*'] },
      isDefault: false,
    };
    const files = fileSet('app/page.tsx', 'lib/db.ts');
    expect(resolveImport('app/page.tsx', '~/lib/db', aliases, files)).toBe('lib/db.ts');
  });

  it('falls back to baseUrl resolution for a non-relative, non-alias specifier', () => {
    // baseUrl="src" → `components/x` resolves under src/.
    const aliases: PathAliases = {
      baseUrl: 'src',
      paths: {},
      isDefault: false,
    };
    const files = fileSet('src/app/page.tsx', 'src/components/x.ts');
    expect(resolveImport('src/app/page.tsx', 'components/x', aliases, files)).toBe(
      'src/components/x.ts',
    );
  });
});
