import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildFirestoreInventory } from './firestore-inventory.js';

describe('buildFirestoreInventory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'firestore-inv-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeRules(name: string, body: string): Promise<string> {
    const p = path.join(tmpDir, name);
    await fsp.writeFile(p, body, 'utf8');
    return p;
  }

  it('returns null when no rules paths are supplied', async () => {
    const inv = await buildFirestoreInventory(tmpDir, []);
    expect(inv).toBeNull();
  });

  it('extracts top-level collections from a typical rules file', async () => {
    const rulesPath = await writeRules(
      'firestore.rules',
      `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
    }
    match /auditRuns/{runId} {
      allow read, write: if request.auth.uid == resource.data.ownerId;
    }
    match /llmCache/{key} {
      allow read: if false;
    }
  }
}`
    );

    const inv = await buildFirestoreInventory(tmpDir, [rulesPath]);
    expect(inv).not.toBeNull();
    expect(inv!.tech).toBe('firestore');
    expect(inv!.confidence).toBe('high');
    const names = inv!.entities.map((e) => e.name).sort();
    expect(names).toEqual(['auditRuns', 'llmCache', 'users']);
    for (const e of inv!.entities) {
      expect(e.fieldCount).toBeNull();
      expect(e.hasRelations).toBe(false);
    }
  });

  it('ignores the /databases/{database}/documents wrapper', async () => {
    const rulesPath = await writeRules(
      'firestore.rules',
      `match /databases/{db}/documents {
        match /onlyOne/{id} {}
      }`
    );
    const inv = await buildFirestoreInventory(tmpDir, [rulesPath]);
    const names = inv!.entities.map((e) => e.name);
    expect(names).not.toContain('databases');
    expect(names).not.toContain('documents');
    expect(names).toContain('onlyOne');
  });

  it('skips collections found inside comments', async () => {
    const rulesPath = await writeRules(
      'firestore.rules',
      `// match /shouldBeIgnored/{id} {}
/* match /alsoIgnored/{id} {} */
match /real/{id} { allow read: if true; }`
    );
    const inv = await buildFirestoreInventory(tmpDir, [rulesPath]);
    const names = inv!.entities.map((e) => e.name);
    expect(names).toEqual(['real']);
  });

  it('deduplicates collection names across multiple rules files', async () => {
    const r1 = await writeRules('firestore.rules', `match /users/{id} {}`);
    const r2 = await writeRules('extra.rules', `match /users/{id} {} match /orders/{id} {}`);
    const inv = await buildFirestoreInventory(tmpDir, [r1, r2]);
    const names = inv!.entities.map((e) => e.name).sort();
    expect(names).toEqual(['orders', 'users']);
    expect(inv!.sourceFiles).toHaveLength(2);
  });

  it('returns an inventory with zero entities for a rules file without match blocks', async () => {
    const rulesPath = await writeRules('storage.rules', `service firebase.storage {}`);
    const inv = await buildFirestoreInventory(tmpDir, [rulesPath]);
    expect(inv).not.toBeNull();
    expect(inv!.tech).toBe('firestore');
    expect(inv!.entities).toEqual([]);
  });
});
