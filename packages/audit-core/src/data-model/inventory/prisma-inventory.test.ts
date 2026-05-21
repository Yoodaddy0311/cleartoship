import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPrismaInventory } from './prisma-inventory.js';

describe('buildPrismaInventory', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'prisma-inv-'));
  });

  afterEach(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSchema(rel: string, body: string): Promise<string> {
    const full = path.join(tmpDir, rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, body, 'utf8');
    return full;
  }

  it('returns null when no schema paths are supplied', async () => {
    const inv = await buildPrismaInventory(tmpDir, []);
    expect(inv).toBeNull();
  });

  it('counts fields and detects relations in a single schema', async () => {
    const schemaPath = await writeSchema(
      'prisma/schema.prisma',
      `model User {
  id    String @id @default(cuid())
  email String @unique
  posts Post[]
}

model Post {
  id       String @id
  title    String
  authorId String
  author   User   @relation(fields: [authorId], references: [id])
}`
    );

    const inv = await buildPrismaInventory(tmpDir, [schemaPath]);
    expect(inv).not.toBeNull();
    expect(inv!.tech).toBe('prisma');
    expect(inv!.confidence).toBe('high');
    expect(inv!.entities).toHaveLength(2);

    const user = inv!.entities.find((e) => e.name === 'User')!;
    const post = inv!.entities.find((e) => e.name === 'Post')!;
    expect(user.fieldCount).toBe(3);
    expect(user.hasRelations).toBe(false);
    expect(post.fieldCount).toBe(4);
    expect(post.hasRelations).toBe(true);
  });

  it('records the source file relative path on every entity', async () => {
    const schemaPath = await writeSchema(
      'apps/api/prisma/schema.prisma',
      `model Order { id String @id }`
    );
    const inv = await buildPrismaInventory(tmpDir, [schemaPath]);
    expect(inv!.entities[0]!.sourceFile).toBe(
      path.join('apps', 'api', 'prisma', 'schema.prisma')
    );
  });

  it('merges multiple schemas', async () => {
    const a = await writeSchema(
      'packages/users/schema.prisma',
      `model User { id String @id }`
    );
    const b = await writeSchema(
      'packages/orders/schema.prisma',
      `model Order { id String @id }`
    );
    const inv = await buildPrismaInventory(tmpDir, [a, b]);
    expect(inv!.entities.map((e) => e.name).sort()).toEqual(['Order', 'User']);
    expect(inv!.sourceFiles).toHaveLength(2);
  });
});
