// Fixture-based unit tests for `extractSymbols` (PRD `lsp-backbone-2026-05-21.md`
// v2 §3 P2.2). We don't spin up a real LSP server here — that integration
// lives in the worker. These tests pin the SymbolInventory shape so the worker
// + UI can rely on a stable contract.

import { describe, expect, it } from 'vitest';
import {
  extractSymbols,
  type RawFileSymbols,
  type RawSymbolNode,
} from './extract-symbols.js';

function range(
  startLine: number,
  startChar: number,
  endLine: number,
  endChar: number,
) {
  return {
    start: { line: startLine, character: startChar },
    end: { line: endLine, character: endChar },
  };
}

function functionNode(name: string, line: number): RawSymbolNode {
  return {
    name,
    kind: 'function',
    range: range(line, 0, line + 5, 0),
    selectionRange: range(line, 9, line, 9 + name.length),
  };
}

function classNode(name: string, line: number, methods: string[] = []): RawSymbolNode {
  return {
    name,
    kind: 'class',
    range: range(line, 0, line + 10, 0),
    selectionRange: range(line, 6, line, 6 + name.length),
    children: methods.map((m, i) => ({
      name: m,
      kind: 'method' as const,
      range: range(line + i + 1, 2, line + i + 1, 30),
      selectionRange: range(line + i + 1, 2, line + i + 1, 2 + m.length),
    })),
  };
}

describe('extractSymbols', () => {
  it('returns the empty inventory when given zero files', () => {
    const out = extractSymbols([]);
    expect(out.summary.totalFunctions).toBe(0);
    expect(out.summary.totalClasses).toBe(0);
    expect(out.summary.totalComponents).toBe(0);
    expect(out.summary.totalImports).toBe(0);
    expect(out.summary.topModules).toEqual([]);
    expect(out.functions).toEqual([]);
    expect(out.classes).toEqual([]);
    expect(out.components).toEqual([]);
    expect(out.imports).toEqual([]);
    expect(out.byFile).toEqual({});
  });

  it('classifies functions vs. classes and folds children into the tree', () => {
    const file: RawFileSymbols = {
      filePath: 'src/auth.ts',
      sourceText: [
        'export function login() {}',
        'function helper() {}',
        'class TokenStore {',
        '  read() {}',
        '  write() {}',
        '}',
      ].join('\n'),
      symbols: [
        // Note: the `selectionRange.start.line` lines up with the source's
        // 0-indexed line of the identifier, which matters for the
        // "looksExported" heuristic — login() lives on line 0 of the source.
        { ...functionNode('login', 0), detail: 'export function login(): void' },
        functionNode('helper', 1),
        classNode('TokenStore', 2, ['read', 'write']),
      ],
    };

    const out = extractSymbols([file]);

    expect(out.summary.totalFunctions).toBe(2);
    expect(out.summary.totalClasses).toBe(1);
    expect(out.summary.totalComponents).toBe(0);
    // 2 functions + 1 class + 2 methods on the class = 5 inventory entries
    // contributing to the file's symbol count (topModules ranking).
    expect(out.summary.topModules).toEqual(['src/auth.ts']);
    expect(out.functions.map((f) => f.name).sort()).toEqual(['helper', 'login']);
    expect(out.functions.find((f) => f.name === 'login')?.isExported).toBe(true);
    expect(out.functions.find((f) => f.name === 'helper')?.isExported).toBe(false);
    expect(out.classes.map((c) => c.name)).toEqual(['TokenStore']);
    // Class methods land in neither `functions` nor `classes` — they live
    // inside the byFile tree (so the UI can render them) and contribute to
    // the per-file symbol count, but the flat category arrays only carry
    // top-level surface area.
    expect(out.byFile['src/auth.ts']?.tree[2]?.children?.length).toBe(2);
  });

  it('promotes PascalCase JSX-returning functions to the "component" kind', () => {
    const file: RawFileSymbols = {
      filePath: 'src/Card.tsx',
      sourceText: [
        'export function Card(props: Props) {',
        '  return <div>{props.title}</div>;',
        '}',
        'function plainHelper() { return 42; }',
      ].join('\n'),
      symbols: [
        // The `range` MUST span the whole declaration so the body scan can
        // see the `return <div>` line — extractSymbols slices the file by
        // range.start.line .. range.end.line inclusive.
        {
          name: 'Card',
          kind: 'function',
          range: range(0, 0, 2, 1),
          selectionRange: range(0, 16, 0, 20),
          detail: 'export function Card(props: Props): JSX.Element',
        },
        {
          name: 'plainHelper',
          kind: 'function',
          range: range(3, 0, 3, 38),
          selectionRange: range(3, 9, 3, 20),
        },
      ],
    };

    const out = extractSymbols([file]);

    expect(out.summary.totalComponents).toBe(1);
    expect(out.summary.totalFunctions).toBe(1); // Card is in components, not functions
    expect(out.components[0]?.name).toBe('Card');
    expect(out.components[0]?.isExported).toBe(true);
    expect(out.functions[0]?.name).toBe('plainHelper');
  });

  it('extracts both ESM imports and CommonJS requires with relative-vs-package flag', () => {
    const file: RawFileSymbols = {
      filePath: 'src/handler.ts',
      sourceText: [
        "import { z } from 'zod';",
        "import type { Foo } from './types.js';",
        "import legacy from '../legacy.js';",
        "const fs = require('node:fs');",
        '',
        '// not an import line — should be ignored',
        "// import { fake } from 'never-imported';",
      ].join('\n'),
      symbols: [],
    };

    const out = extractSymbols([file]);

    expect(out.summary.totalImports).toBe(4);
    const specs = out.imports.map((i) => i.specifier);
    expect(specs).toContain('zod');
    expect(specs).toContain('./types.js');
    expect(specs).toContain('../legacy.js');
    expect(specs).toContain('node:fs');

    const zodImport = out.imports.find((i) => i.specifier === 'zod');
    expect(zodImport?.isRelative).toBe(false);
    expect(zodImport?.line).toBe(1);

    const relativeImport = out.imports.find((i) => i.specifier === './types.js');
    expect(relativeImport?.isRelative).toBe(true);
  });

  it('ranks topModules by symbol count and respects the limit option', () => {
    const small: RawFileSymbols = {
      filePath: 'src/small.ts',
      sourceText: 'function tiny() {}',
      symbols: [functionNode('tiny', 0)],
    };
    const large: RawFileSymbols = {
      filePath: 'src/large.ts',
      sourceText: ['function a(){}', 'function b(){}', 'function c(){}'].join('\n'),
      symbols: [
        functionNode('a', 0),
        functionNode('b', 1),
        functionNode('c', 2),
      ],
    };
    const empty: RawFileSymbols = {
      filePath: 'src/empty.ts',
      sourceText: '// comment only',
      symbols: [],
    };

    const out = extractSymbols([small, large, empty], { topModulesLimit: 1 });
    // Only the highest-symbol-count file should remain after the limit cap;
    // the empty file must be excluded entirely (filter rule: count > 0).
    expect(out.summary.topModules).toEqual(['src/large.ts']);
  });
});
