import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { detectDataModelInventory } from './detect.js';

describe('detectDataModelInventory', () => {
  let root: string;

  beforeEach(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'detect-dm-'));
  });

  afterEach(async () => {
    await fsp.rm(root, { recursive: true, force: true });
  });

  async function write(rel: string, body: string): Promise<void> {
    const full = path.join(root, rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, body, 'utf8');
  }

  it('returns tech="none" for a repo with no schema sources', async () => {
    await write('README.md', 'Just a readme');
    const inv = await detectDataModelInventory(root);
    expect(inv.tech).toBe('none');
    expect(inv.entities).toEqual([]);
  });

  it('detects Prisma when prisma/schema.prisma is present', async () => {
    await write('prisma/schema.prisma', `model User { id String @id }`);
    const inv = await detectDataModelInventory(root);
    expect(inv.tech).toBe('prisma');
    expect(inv.entities.map((e) => e.name)).toEqual(['User']);
  });

  it('detects Firestore when firestore.rules is present', async () => {
    await write(
      'firestore.rules',
      `match /databases/{db}/documents { match /users/{id} { allow read: if true; } }`
    );
    const inv = await detectDataModelInventory(root);
    expect(inv.tech).toBe('firestore');
    expect(inv.entities.map((e) => e.name)).toEqual(['users']);
  });

  it('prefers Prisma over Firestore in a multi-stack repo', async () => {
    await write('prisma/schema.prisma', `model User { id String @id }`);
    await write(
      'firestore.rules',
      `match /databases/{db}/documents { match /legacyDocs/{id} {} }`
    );
    const inv = await detectDataModelInventory(root);
    expect(inv.tech).toBe('prisma');
  });

  it('skips node_modules and other irrelevant dirs', async () => {
    await write('node_modules/foo/prisma/schema.prisma', `model Hidden { id String @id }`);
    await write('.git/HEAD', 'ref: refs/heads/main');
    const inv = await detectDataModelInventory(root);
    expect(inv.tech).toBe('none');
  });

  it('does not throw on permission errors — returns empty inventory', async () => {
    // Hard to simulate cleanly cross-platform; the catch-all in detect.ts
    // is exercised by feeding a path that doesn't exist.
    const inv = await detectDataModelInventory(path.join(root, 'does-not-exist'));
    expect(inv.tech).toBe('none');
  });
});
