// Tests for discoverRiskyFunctions — category classification + caps.

import { describe, expect, it } from 'vitest';
import {
  discoverRiskyFunctions,
  type DiscoverRiskyInput,
  type RiskyFunction,
} from './risky-functions.js';

function makeInput(
  files: Record<string, string>,
  overrides: Partial<DiscoverRiskyInput> = {},
): DiscoverRiskyInput {
  const fileTree = Object.keys(files);
  return {
    projectRoot: '/tmp/repo',
    fileTree,
    readFile: async (p) => files[p] ?? '',
    ...overrides,
  };
}

describe('discoverRiskyFunctions — category classification', () => {
  it('classifies auth functions by name (login)', async () => {
    const files = {
      'src/auth.ts': `
        export async function login(email: string, password: string) {
          const user = await db.user.findUnique({ where: { email } });
          return user;
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.some((r) => r.category === 'auth' && r.name === 'login')).toBe(true);
  });

  it('classifies payment functions by name (chargeCard)', async () => {
    const files = {
      'src/billing.ts': `
        export async function chargeCard(amount: number) {
          await stripe.charges.create({ amount });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.some((r) => r.category === 'payment' && r.name === 'chargeCard')).toBe(
      true,
    );
  });

  it('classifies delete functions by name (deleteUser)', async () => {
    const files = {
      'src/users.ts': `
        export async function deleteUser(userId: string) {
          await db.user.delete({ where: { id: userId } });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.some((r) => r.category === 'delete' && r.name === 'deleteUser')).toBe(
      true,
    );
  });

  it('classifies PII functions by name (savePhone)', async () => {
    const files = {
      'src/profile.ts': `
        export async function savePhone(userId: string, phone: string) {
          return db.profile.update({ where: { id: userId }, data: { phone } });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.some((r) => r.category === 'pii' && r.name === 'savePhone')).toBe(true);
  });

  it('classifies auth-boundary on middleware.ts export default', async () => {
    const files = {
      'middleware.ts': `
        import { NextResponse } from 'next/server';
        export default function middleware(req: Request) {
          return NextResponse.next();
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.some((r) => r.category === 'auth-boundary')).toBe(true);
  });

  it('classifies data-mutation when prisma deleteMany is used without transaction', async () => {
    const files = {
      'src/bulk.ts': `
        import { PrismaClient } from '@prisma/client';
        const prisma = new PrismaClient();

        export async function bulkPurge(ids: string[]) {
          await prisma.session.deleteMany({ where: { userId: { in: ids } } });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(
      out.some(
        (r) => r.category === 'data-mutation' || r.category === 'delete',
      ),
    ).toBe(true);
  });

  it('does NOT flag data-mutation when wrapped in transaction', async () => {
    const files = {
      'src/safe.ts': `
        export async function safeBulkOp(ids: string[]) {
          await prisma.$transaction(async (tx) => {
            await tx.session.deleteMany({ where: { userId: { in: ids } } });
          });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'safeBulkOp');
    if (hit) {
      expect(hit.category).not.toBe('data-mutation');
    }
  });

  // BUG-3: PRISMA_MUTATION_REGEX matches `.update()` / `.delete()` verbs by
  // name only, so Firestore Admin/Client SDK calls (`docRef.update()`,
  // `batch.delete()`) were being misclassified as "untransactioned ORM
  // multi-row mutation". When a Firestore SDK is imported the heuristic now
  // suppresses the match because the semantics (single-document write on a
  // DocumentReference / WriteBatch) are different from a Prisma multi-row op.
  it('does NOT flag data-mutation for Firestore writers (firebase-admin import)', async () => {
    const files = {
      'src/firestore/writers.ts': `
        import { FieldValue } from 'firebase-admin/firestore';
        import { getDb } from './client';

        export async function markRunCompleted(runId: string) {
          const db = getDb();
          const batch = db.batch();
          const docRef = db.collection('audit_runs').doc(runId);
          batch.update(docRef, { status: 'COMPLETED', completedAt: FieldValue.serverTimestamp() });
          await batch.commit();
          await docRef.update({ progress: 100 });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'markRunCompleted');
    // Either omitted entirely or classified as something other than
    // data-mutation; the name doesn't carry any other risky signal so the
    // expected outcome is "not surfaced at all".
    if (hit) {
      expect(hit.category).not.toBe('data-mutation');
    } else {
      expect(hit).toBeUndefined();
    }
  });

  it('does NOT flag data-mutation for @google-cloud/firestore imports', async () => {
    const files = {
      'src/store.ts': `
        import { Firestore } from '@google-cloud/firestore';

        export async function updateProfile(uid: string, patch: Record<string, unknown>) {
          const fs = new Firestore();
          await fs.doc('users/' + uid).update(patch);
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'updateProfile');
    if (hit) {
      expect(hit.category).not.toBe('data-mutation');
    } else {
      expect(hit).toBeUndefined();
    }
  });

  it('STILL flags data-mutation for prisma.user.update (no firestore import)', async () => {
    const files = {
      'src/users.ts': `
        import { PrismaClient } from '@prisma/client';
        const prisma = new PrismaClient();

        export async function patchUser(id: string, patch: Record<string, unknown>) {
          await prisma.user.update({ where: { id }, data: patch });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'patchUser');
    expect(hit).toBeDefined();
    expect(hit!.category).toBe('data-mutation');
  });

  // BUG-3 round 2: extractImports only recognised ESM `from '...'` specifiers,
  // so CommonJS `require('firebase-admin/firestore')` calls bypassed the
  // Firestore negative guard and surfaced as data-mutation false positives.
  it('does NOT flag data-mutation for CommonJS require("firebase-admin/firestore")', async () => {
    const files = {
      'lib/triggers/on-audit-run-created.js': `
        "use strict";
        const { getFirestore, FieldValue } = require('firebase-admin/firestore');
        const db = getFirestore();

        async function persistEnqueueMode(runId, mode) {
          await db.collection('audit_runs').doc(runId).update({ enqueueMode: mode, updatedAt: FieldValue.serverTimestamp() });
        }

        module.exports = { persistEnqueueMode };
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'persistEnqueueMode');
    if (hit) {
      expect(hit.category).not.toBe('data-mutation');
    } else {
      expect(hit).toBeUndefined();
    }
  });

  // BUG-3 round 2: PRISMA_MUTATION_REGEX matched `Set.prototype.delete()` in
  // UI helpers (e.g. `next.delete(value)`) even when no ORM import existed,
  // because the heuristic only had a negative Firestore guard. We now require
  // a positive Prisma/Drizzle import signal before classifying as data-mutation.
  it('does NOT flag data-mutation for Set.delete() in UI helpers (no ORM import)', async () => {
    const files = {
      'src/filter-chips.tsx': `
        import * as React from 'react';

        export function toggle(prev: Set<string>, value: string): Set<string> {
          const next = new Set(prev);
          if (next.has(value)) {
            next.delete(value);
          } else {
            next.add(value);
          }
          return next;
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'toggle');
    if (hit) {
      expect(hit.category).not.toBe('data-mutation');
    } else {
      expect(hit).toBeUndefined();
    }
  });

  it('STILL flags data-mutation for @prisma/client import (positive ORM guard)', async () => {
    const files = {
      'src/users.ts': `
        import { PrismaClient } from '@prisma/client';
        const client = new PrismaClient();

        export async function bulkDelete(ids: string[]) {
          await client.user.deleteMany({ where: { id: { in: ids } } });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'bulkDelete');
    expect(hit).toBeDefined();
    expect(hit!.category).toBe('data-mutation');
  });

  it('STILL flags data-mutation for drizzle-orm import (positive ORM guard)', async () => {
    const files = {
      'src/posts.ts': `
        import { eq } from 'drizzle-orm';
        import { db } from './db';

        export async function applyPostsPatch(ids: number[]) {
          await db.update(postsTable).set({ archived: true }).where(eq(postsTable.id, ids[0]));
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'applyPostsPatch');
    expect(hit).toBeDefined();
    expect(hit!.category).toBe('data-mutation');
  });
});

// O4: extractImports used to cap at the first 30 lines, which missed transpiled
// bundles / large workspace outputs where imports legitimately span 40+ lines.
// The scan now walks forward dynamically and terminates only after 5 consecutive
// non-import code lines (or a hard 200-line safety bound).
describe('discoverRiskyFunctions — extractImports dynamic stop', () => {
  it('captures imports past line 30 (40-line ESM import block) and classifies function after', async () => {
    const importBlock = Array.from({ length: 40 }, (_, i) => `import lib${i} from 'lib-${i}';`).join('\n');
    const files = {
      'src/bulk.ts':
        `import { PrismaClient } from '@prisma/client';\n` +
        `${importBlock}\n` +
        `\n` +
        `const prisma = new PrismaClient();\n` +
        `\n` +
        `export async function bulkPurgeMany(ids: string[]) {\n` +
        `  await prisma.user.deleteMany({ where: { id: { in: ids } } });\n` +
        `}\n`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'bulkPurgeMany');
    expect(hit).toBeDefined();
    expect(hit!.importedFrom).toContain('@prisma/client');
    expect(hit!.importedFrom).toContain('lib-39');
    expect(hit!.category).toBe('data-mutation');
  });

  it('captures CommonJS prisma require past line 30 (positive ORM guard via CJS)', async () => {
    // A transpiled CJS bundle where `require('@prisma/client')` sits past
    // line 30. The positive ORM guard must still trigger → data-mutation.
    // If extractImports were still 30-line capped, the guard would miss and
    // the body match would be suppressed.
    const requireBlock = Array.from(
      { length: 35 },
      (_, i) => `const dep${i} = require('dep-${i}');`,
    ).join('\n');
    const files = {
      'src/cjs-bundle.js':
        `"use strict";\n` +
        `${requireBlock}\n` +
        `const { PrismaClient } = require('@prisma/client');\n` +
        `const prisma = new PrismaClient();\n` +
        `\n` +
        `async function bulkPurgeFromCjs(ids) {\n` +
        `  await prisma.session.deleteMany({ where: { userId: { in: ids } } });\n` +
        `}\n` +
        `\n` +
        `module.exports = { bulkPurgeFromCjs };\n`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'bulkPurgeFromCjs');
    expect(hit).toBeDefined();
    expect(hit!.importedFrom).toContain('@prisma/client');
    expect(hit!.category).toBe('data-mutation');
  });

  it('terminates after 5 consecutive non-import code lines and ignores later imports', async () => {
    const files = {
      'src/short.ts':
        `import { PrismaClient } from '@prisma/client';\n` +
        `const a = 1;\n` +
        `const b = 2;\n` +
        `const c = 3;\n` +
        `const d = 4;\n` +
        `const e = 5;\n` +
        `import sneaky from 'sneaky-late-import';\n` +
        `\n` +
        `export async function patchOne(id: string) {\n` +
        `  await db.user.update({ where: { id }, data: {} });\n` +
        `}\n`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'patchOne');
    expect(hit?.importedFrom ?? []).toContain('@prisma/client');
    expect(hit?.importedFrom ?? []).not.toContain('sneaky-late-import');
  });

  it('respects the 200-line hard safety bound', async () => {
    const blankBlock = Array.from({ length: 250 }, () => '').join('\n');
    const files = {
      'src/edge.ts':
        `import { PrismaClient } from '@prisma/client';\n` +
        `${blankBlock}\n` +
        `import wayPastBound from 'past-200-line-bound';\n` +
        `\n` +
        `export async function deleteAll() {\n` +
        `  await db.x.deleteMany({});\n` +
        `}\n`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'deleteAll');
    expect(hit).toBeDefined();
    expect(hit!.importedFrom).toContain('@prisma/client');
    expect(hit!.importedFrom).not.toContain('past-200-line-bound');
  });
});

describe('discoverRiskyFunctions — extraction details', () => {
  it('returns snippet, line number, and imports', async () => {
    const files = {
      'src/auth.ts':
        `import bcrypt from 'bcrypt';\n` +
        `import { db } from './db';\n` +
        `\n` +
        `export async function login(email: string, password: string) {\n` +
        `  const user = await db.user.findUnique({ where: { email } });\n` +
        `  return user;\n` +
        `}\n`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'login')!;
    expect(hit).toBeDefined();
    expect(hit.line).toBe(4);
    expect(hit.snippet).toContain('login');
    expect(hit.importedFrom).toContain('bcrypt');
    expect(hit.importedFrom).toContain('./db');
  });

  // O3: FUNCTION_PATTERNS has overlap — `export function foo` is matched by
  // both the "export function" and the bare "function" pattern but with
  // different `m.index` (one points at `export`, the other at `function`).
  // The old `${name}@${m.index}` dedup key did not collapse them, producing a
  // duplicate FunctionMatch entry for the same function. dedup must key on
  // the absolute position of the function NAME token (stable across patterns).
  it('emits each function exactly once even when multiple patterns match', async () => {
    const files = {
      'src/auth.ts': `
        export async function login(email: string, password: string) {
          return null;
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const logins = out.filter((r) => r.name === 'login');
    expect(logins.length).toBe(1);
  });

  it('dedup works for export const arrow and plain function in same file', async () => {
    const files = {
      'src/multi.ts': `
        export const deleteCart = async (id: string) => {
          await something(id);
        };
        export async function deleteOrder(id: string) {
          await other(id);
        }
        function deleteToken(id: string) {
          return id;
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const names = out.map((r) => r.name);
    expect(names.filter((n) => n === 'deleteCart').length).toBe(1);
    expect(names.filter((n) => n === 'deleteOrder').length).toBe(1);
    expect(names.filter((n) => n === 'deleteToken').length).toBe(1);
  });

  it('caps snippet at ~1KB', async () => {
    const bigBody = 'const x = 1;\n'.repeat(500);
    const files = {
      'src/big.ts': `export async function deleteThing(id: string) {\n${bigBody}}\n`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'deleteThing')!;
    expect(hit).toBeDefined();
    expect(hit.snippet.length).toBeLessThanOrEqual(1024 + 30);
  });
});

// O4: extractImports used to cap at 30 lines, which missed transpiled bundles
// and files with large import blocks (npm workspace outputs, generated code).
// The scan now walks forward dynamically — counting consecutive non-import
// code lines as a soft terminator — with a hard 200-line safety bound.
describe('discoverRiskyFunctions — O4 extractImports dynamic scan', () => {
  it('captures imports past line 30 (40-line import block then function)', async () => {
    const importLines: string[] = [];
    for (let i = 0; i < 38; i++) {
      importLines.push(`import { mod${i} } from 'lib-${i}';`);
    }
    // Place the firestore import at line 39 (past the old 30-line cap)
    importLines.push(`import { FieldValue } from 'firebase-admin/firestore';`);
    importLines.push(`import { getDb } from './client';`);
    const body =
      `\n` +
      `export async function updateProfile(uid: string, patch: Record<string, unknown>) {\n` +
      `  const db = getDb();\n` +
      `  await db.collection('users').doc(uid).update(patch);\n` +
      `}\n`;
    const files = {
      'src/firestore/large-imports.ts': importLines.join('\n') + body,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    // Imports past line 30 must be captured so the Firestore guard suppresses
    // the data-mutation false positive on `.update()`.
    const hit = out.find((r) => r.name === 'updateProfile');
    if (hit) {
      expect(hit.category).not.toBe('data-mutation');
      expect(hit.importedFrom).toContain('firebase-admin/firestore');
    } else {
      expect(hit).toBeUndefined();
    }
  });

  it('still classifies data-mutation when prisma import sits past line 30', async () => {
    const importLines: string[] = [];
    for (let i = 0; i < 35; i++) {
      importLines.push(`import { util${i} } from 'util-${i}';`);
    }
    importLines.push(`import { PrismaClient } from '@prisma/client';`);
    const body =
      `\n` +
      `const prisma = new PrismaClient();\n` +
      `\n` +
      `export async function bulkPurge(ids: string[]) {\n` +
      `  await prisma.session.deleteMany({ where: { userId: { in: ids } } });\n` +
      `}\n`;
    const files = {
      'src/bulk.ts': importLines.join('\n') + body,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'bulkPurge');
    expect(hit).toBeDefined();
    expect(hit!.importedFrom).toContain('@prisma/client');
  });

  it('terminates scan early when 5+ consecutive non-import code lines appear', async () => {
    // Real code starts at line 1 with NO imports — soft terminator should kick
    // in well before line 200 so this completes quickly.
    const codeLines: string[] = [];
    for (let i = 0; i < 50; i++) {
      codeLines.push(`const value${i} = ${i};`);
    }
    // Place a firestore import after the soft terminator — should NOT be picked up.
    codeLines.push(`import { FieldValue } from 'firebase-admin/firestore';`);
    codeLines.push(`export async function bulkDelete(ids: string[]) {`);
    codeLines.push(`  const db = client;`);
    codeLines.push(`  await db.session.deleteMany({ where: { id: { in: ids } } });`);
    codeLines.push(`}`);
    const files = {
      'src/edge.ts':
        // Add the prisma import on line 1 so we still classify the function
        `import { PrismaClient } from '@prisma/client';\n` +
        `const client = new PrismaClient();\n` +
        codeLines.join('\n'),
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'bulkDelete');
    expect(hit).toBeDefined();
    // The firestore import sits past 5 consecutive non-import lines → soft
    // terminator triggers BEFORE it is reached → no Firestore guard → still
    // classified as data-mutation.
    expect(hit!.category).toBe('data-mutation');
    expect(hit!.importedFrom).not.toContain('firebase-admin/firestore');
  });

  it('does not exceed the 200-line safety bound', async () => {
    // Pathological input: 1000 import-shaped lines. Scanner must still cap at
    // 200 and remain O(n). We do not assert performance, just that the output
    // is bounded and the function returns within the test timeout.
    const importLines: string[] = [];
    for (let i = 0; i < 1000; i++) {
      importLines.push(`import { mod${i} } from 'pkg-${i}';`);
    }
    const body =
      `\n` +
      `export async function placeholder() { return null; }\n`;
    const files = { 'src/huge.ts': importLines.join('\n') + body };
    const out = await discoverRiskyFunctions(makeInput(files));
    // No assertion on risky output (placeholder isn't risky); just confirm we
    // don't blow up and the run completes.
    expect(Array.isArray(out)).toBe(true);
  });
});

describe('discoverRiskyFunctions — stop conditions', () => {
  it('excludes test files (.test.ts, .spec.ts, __tests__/)', async () => {
    const files = {
      'src/auth.test.ts': `export async function login() {}`,
      'src/billing.spec.ts': `export async function chargeCard() {}`,
      'src/__tests__/x.ts': `export async function deleteUser() {}`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out).toEqual([]);
  });

  it('limits to 5 risky functions per file', async () => {
    const names = [
      'deleteUser',
      'deletePost',
      'deleteSession',
      'deleteOrder',
      'deleteCart',
      'deleteAddress',
      'deleteToken',
    ];
    const src = names
      .map((n) => `export async function ${n}(id: string) { return db.x.delete({}); }`)
      .join('\n');
    const files = { 'src/bulk.ts': src };
    const out = await discoverRiskyFunctions(makeInput(files));
    const fromFile = out.filter((r) => r.path === 'src/bulk.ts');
    expect(fromFile.length).toBeLessThanOrEqual(5);
  });

  it('honors global maxFunctions cap', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      files[`src/f${i}.ts`] = `export async function deleteUser${i}() {}`;
    }
    const out = await discoverRiskyFunctions(makeInput(files, { maxFunctions: 7 }));
    expect(out.length).toBe(7);
  });

  it('returns [] when no patterns match', async () => {
    const files = {
      'src/utils.ts': `export function add(a: number, b: number) { return a + b; }`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out).toEqual([]);
  });
});

// O1: compile-output directories (lib/, dist/, build/, .next/, out/, etc.) are
// transpiled copies of src/ — scanning both produces duplicate risky-function
// findings against the same logical function (e.g., `functions/lib/triggers/x.js`
// duplicates `functions/src/triggers/x.ts`). discoverRiskyFunctions must skip
// these path patterns while preserving legitimate source paths like `src/lib/`.
describe('discoverRiskyFunctions — O1 compile-output exclusion', () => {
  it('excludes top-level lib/ as a compile output', async () => {
    const files = {
      'lib/triggers/cleanup.js': `
        async function deleteOldRecords(cutoff) {
          await db.collection('x').doc(cutoff).delete();
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.find((r) => r.path === 'lib/triggers/cleanup.js')).toBeUndefined();
  });

  it('excludes functions/lib/ (firebase functions compile output)', async () => {
    const files = {
      'functions/lib/triggers/on-audit-run-created.js': `
        async function deleteUser(uid) { await db.user.delete({ where: { id: uid } }); }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.find((r) => r.path.startsWith('functions/lib/'))).toBeUndefined();
  });

  it('excludes packages/x/lib/ (workspace package compile output)', async () => {
    const files = {
      'packages/ui/lib/filter-chips.js': `
        export function deleteChip(id) { return id; }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.find((r) => r.path.startsWith('packages/ui/lib/'))).toBeUndefined();
  });

  it('excludes **/dist/**, **/build/**, **/.next/**, **/out/**, **/coverage/**', async () => {
    const files = {
      'apps/web/dist/server.js': `export async function deleteUser() {}`,
      'apps/web/build/server.js': `export async function chargeCard() {}`,
      'apps/web/.next/server/pages/api/login.js': `export async function login() {}`,
      'apps/web/out/static.js': `export async function deletePost() {}`,
      'coverage/lcov-report/index.js': `export async function deleteSession() {}`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out).toEqual([]);
  });

  it('PRESERVES src/lib/ (legitimate source under src/)', async () => {
    const files = {
      'apps/web/src/lib/auth.ts': `
        export async function login(email: string, password: string) {
          return { email, password };
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'login');
    expect(hit).toBeDefined();
    expect(hit!.path).toBe('apps/web/src/lib/auth.ts');
  });

  it('PRESERVES top-level src/lib/utils.ts', async () => {
    const files = {
      'src/lib/utils.ts': `
        export async function deleteUser(id: string) {
          return id;
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hit = out.find((r) => r.name === 'deleteUser');
    expect(hit).toBeDefined();
    expect(hit!.path).toBe('src/lib/utils.ts');
  });

  it('does NOT dedup when src/ source exists AND lib/ output is skipped', async () => {
    const files = {
      'functions/src/triggers/on-audit-run-created.ts': `
        export async function deleteIdleAnonymousUsers() {
          await db.user.delete({ where: { createdAt: { lt: new Date() } } });
        }
      `,
      'functions/lib/triggers/on-audit-run-created.js': `
        async function deleteIdleAnonymousUsers() {
          await db.user.delete({ where: { createdAt: { lt: new Date() } } });
        }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const hits = out.filter((r) => r.name === 'deleteIdleAnonymousUsers');
    expect(hits.length).toBe(1);
    expect(hits[0]!.path).toBe('functions/src/triggers/on-audit-run-created.ts');
  });

  it('does not falsely match directory names like "library" or "myliberty"', async () => {
    const files = {
      'src/library/auth.ts': `
        export async function login(email: string) { return email; }
      `,
      'src/myliberty/api.ts': `
        export async function deleteUser(id: string) { return id; }
      `,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    expect(out.find((r) => r.name === 'login')).toBeDefined();
    expect(out.find((r) => r.name === 'deleteUser')).toBeDefined();
  });
});

describe('discoverRiskyFunctions — RiskyFunction shape', () => {
  it('emits objects matching RiskyFunction type at runtime', async () => {
    const files = {
      'src/auth.ts': `export async function login() {}`,
    };
    const out = await discoverRiskyFunctions(makeInput(files));
    const fn: RiskyFunction = out[0]!;
    expect(typeof fn.category).toBe('string');
    expect(typeof fn.path).toBe('string');
    expect(typeof fn.line).toBe('number');
    expect(typeof fn.name).toBe('string');
    expect(typeof fn.snippet).toBe('string');
    expect(typeof fn.reason).toBe('string');
    expect(Array.isArray(fn.importedFrom)).toBe(true);
  });
});
