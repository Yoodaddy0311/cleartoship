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
