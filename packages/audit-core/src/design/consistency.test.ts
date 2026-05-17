// Tests for analyzeDesignConsistency.
//
// Strategy: build an in-memory file map and pass a `readFile` function that
// resolves paths against it. This lets every rule trigger deterministically
// without touching the real filesystem.

import { describe, expect, it } from 'vitest';
import {
  analyzeDesignConsistency,
  __internals,
} from './consistency.js';

function makeReader(files: Record<string, string>) {
  return async (p: string) => (p in files ? files[p]! : null);
}

describe('extractTokensFromConfig', () => {
  it('parses theme.colors / theme.spacing / theme.fontSize top-level keys', () => {
    const config = `
import type { Config } from 'tailwindcss';
export default {
  theme: {
    colors: {
      primary: '#3b82f6',
      secondary: '#10b981',
      'brand-dark': '#0f172a',
    },
    spacing: {
      '1': '4px',
      '2': '8px',
      '4': '16px',
    },
    fontSize: {
      sm: '14px',
      base: '16px',
    },
  },
} satisfies Config;
    `;
    const tokens = __internals.extractTokensFromConfig(config);
    expect(tokens.colors.size).toBe(3);
    expect(tokens.colors.has('primary')).toBe(true);
    expect(tokens.colors.has('brand-dark')).toBe(true);
    expect(tokens.spacing.size).toBe(3);
    expect(tokens.fontSize.has('sm')).toBe(true);
  });

  it('returns empty sets when sections are absent', () => {
    const tokens = __internals.extractTokensFromConfig('export default { plugins: [] };');
    expect(tokens.colors.size).toBe(0);
    expect(tokens.spacing.size).toBe(0);
    expect(tokens.fontSize.size).toBe(0);
  });
});

describe('extractCssCustomProperties', () => {
  it('finds --token: declarations', () => {
    const css = `
:root {
  --color-bg: #fff;
  --color-fg-primary: #111;
  --space-1: 4px;
}
.foo { color: var(--color-fg-primary); }
    `;
    const props = __internals.extractCssCustomProperties(css);
    expect(props).toContain('--color-bg');
    expect(props).toContain('--color-fg-primary');
    expect(props).toContain('--space-1');
  });
});

describe('recordClassNames', () => {
  it('splits className strings into tokens and tracks file/line', () => {
    const usage = __internals.emptyUsage();
    const text = [
      'export function A() {',
      '  return <div className="p-2 bg-red-500 text-white" />;',
      '}',
    ].join('\n');
    __internals.recordClassNames(text, 'src/A.tsx', usage);
    expect(usage.tokens.has('p-2')).toBe(true);
    expect(usage.tokens.has('bg-red-500')).toBe(true);
    expect(usage.tokens.get('bg-red-500')![0]).toEqual({ path: 'src/A.tsx', line: 2 });
    expect(usage.totalTokens).toBe(3);
  });

  it('flags arbitrary color and length tokens', () => {
    const usage = __internals.emptyUsage();
    const text = `const x = <div className="bg-[#ff00aa] p-[13px]" />`;
    __internals.recordClassNames(text, 'a.tsx', usage);
    expect(usage.arbitraryColors).toBe(1);
    expect(usage.arbitraryLengths).toBe(1);
  });
});

describe('analyzeDesignConsistency — palette rule (P1)', () => {
  it('fires when >12 color families are used', async () => {
    // 13 different color families via bg-*-500 tokens.
    const colorNames = [
      'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'teal',
      'indigo', 'cyan', 'lime', 'rose', 'fuchsia',
    ];
    const files: Record<string, string> = {};
    const componentFiles: string[] = [];
    colorNames.forEach((c, i) => {
      const p = `src/Box${i}.tsx`;
      files[p] = `export default () => <div className="bg-${c}-500 text-${c}-700" />;`;
      componentFiles.push(p);
    });

    const { report, findings } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: componentFiles,
      readFile: makeReader(files),
    });

    expect(report.tokens.colors.used).toBeGreaterThan(12);
    const palette = findings.find((f) => f.tags.includes('palette'));
    expect(palette).toBeDefined();
    expect(palette!.severity).toBe('P1');
    expect(palette!.category).toBe('UX_UI');
    expect(palette!.tags).toContain('design-consistency');
    expect(palette!.recommendation).toContain('tailwind.config');
    expect(palette!.nonDeveloperExplanation).toBeTruthy();
  });

  it('does NOT fire when color usage is within limits', async () => {
    const files = {
      'src/Box.tsx': `<div className="bg-blue-500 text-white" />`,
    };
    const { findings } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['src/Box.tsx'],
      readFile: makeReader(files),
    });
    expect(findings.find((f) => f.tags.includes('palette'))).toBeUndefined();
  });
});

describe('analyzeDesignConsistency — arbitrary values rule (P2)', () => {
  it('fires when arbitrary-value tokens exceed 5% of total tokens', async () => {
    // 10 normal tokens + 2 arbitrary = 16.6% arbitrary ratio.
    const files = {
      'src/A.tsx':
        `<div className="bg-blue-500 text-white p-2 m-4 rounded-md shadow-sm border border-gray-200 hover:bg-blue-600 bg-[#abcdef] p-[13px]" />`,
    };
    const { findings } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['src/A.tsx'],
      readFile: makeReader(files),
    });
    const arbitrary = findings.find((f) => f.tags.includes('arbitrary-values'));
    expect(arbitrary).toBeDefined();
    expect(arbitrary!.severity).toBe('P2');
    expect(arbitrary!.evidences.length).toBeGreaterThan(0);
  });
});

describe('analyzeDesignConsistency — spacing off-scale rule (P2)', () => {
  it('fires when off-scale spacing tokens >= 10', async () => {
    // Use arbitrary spacing tokens — guaranteed off-scale.
    const arbitraryTokens = Array.from({ length: 12 }, (_, i) => `p-[${i + 5}px]`).join(' ');
    const files = {
      'src/A.tsx': `<div className="${arbitraryTokens}" />`,
    };
    const { findings, report } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['src/A.tsx'],
      readFile: makeReader(files),
    });
    expect(report.tokens.spacing.offScale.length).toBeGreaterThanOrEqual(10);
    const spacing = findings.find((f) => f.tags.includes('spacing'));
    expect(spacing).toBeDefined();
    expect(spacing!.severity).toBe('P2');
  });
});

describe('analyzeDesignConsistency — duplication rule (P2)', () => {
  it('fires when the same className combo repeats 5+ times', async () => {
    const combo = 'bg-blue-500 p-2 rounded';
    const files: Record<string, string> = {};
    const fileTree: string[] = [];
    for (let i = 0; i < 6; i++) {
      const p = `src/Dup${i}.tsx`;
      files[p] = `<div className="${combo}" />`;
      fileTree.push(p);
    }
    const { findings, report } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree,
      readFile: makeReader(files),
    });
    expect(report.duplications.length).toBeGreaterThan(0);
    const dup = findings.find((f) => f.tags.includes('duplication'));
    expect(dup).toBeDefined();
    expect(dup!.severity).toBe('P2');
    expect(dup!.evidences.length).toBeGreaterThan(0);
  });
});

describe('analyzeDesignConsistency — tailwind config integration', () => {
  it('uses theme.spacing from tailwind.config to suppress off-scale flags for defined keys', async () => {
    const config = `
export default {
  theme: {
    spacing: {
      'tiny': '2px',
      'small': '4px',
    },
  },
};
    `;
    const files = {
      'tailwind.config.ts': config,
      'src/A.tsx': `<div className="p-tiny m-small" />`,
    };
    const { report } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['tailwind.config.ts', 'src/A.tsx'],
      readFile: makeReader(files),
    });
    expect(report.tokens.spacing.defined).toBe(2);
    expect(report.tokens.spacing.offScale).toHaveLength(0);
  });
});

describe('analyzeDesignConsistency — score', () => {
  it('returns 100 for a tiny clean codebase', async () => {
    const files = {
      'src/A.tsx': `<div className="p-2 bg-blue-500" />`,
    };
    const { report } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['src/A.tsx'],
      readFile: makeReader(files),
    });
    expect(report.score).toBe(100);
  });

  it('penalises heavy violations toward 0', async () => {
    const colorNames = [
      'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange', 'teal',
      'indigo', 'cyan', 'lime', 'rose', 'fuchsia', 'amber', 'emerald',
    ];
    const files: Record<string, string> = {};
    const fileTree: string[] = [];
    colorNames.forEach((c, i) => {
      const p = `src/F${i}.tsx`;
      files[p] = `<div className="bg-${c}-500 bg-[#abc${i}ef] p-[${i + 5}px]" />`;
      fileTree.push(p);
    });
    const { report } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree,
      readFile: makeReader(files),
    });
    expect(report.score).toBeLessThan(80);
  });
});

describe('analyzeDesignConsistency — robustness', () => {
  it('runs with no readFile (structure-only mode)', async () => {
    const { report, findings } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['src/A.tsx', 'tailwind.config.ts'],
    });
    expect(report.score).toBe(100);
    expect(findings).toHaveLength(0);
  });

  it('handles unreadable files gracefully (readFile returns null)', async () => {
    const { report, findings } = await analyzeDesignConsistency({
      projectRoot: '/tmp/project',
      fileTree: ['src/A.tsx'],
      readFile: async () => null,
    });
    expect(report.tokens.colors.used).toBe(0);
    expect(findings).toHaveLength(0);
  });
});
