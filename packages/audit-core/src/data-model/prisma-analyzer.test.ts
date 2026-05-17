import { describe, expect, it } from 'vitest';
import { analyzePrismaSchema } from './prisma-analyzer.js';

function makeReader(content: string): (p: string) => Promise<string> {
  return async () => content;
}

describe('analyzePrismaSchema', () => {
  it('R1: emits P0 finding when a model has no @id and no @@id', async () => {
    const schema = `
model Post {
  title String
  body  String
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/abs/schema.prisma',
      readFile: makeReader(schema),
    });
    const r1 = findings.find((f) => f.tags.includes('R1_MISSING_ID'));
    expect(r1).toBeDefined();
    expect(r1!.severity).toBe('P0');
    expect(r1!.category).toBe('DATA_MODEL');
    expect(r1!.title).toContain('Post');
    expect(r1!.evidences[0]!.path).toBe('/abs/schema.prisma');
    expect(r1!.evidences[0]!.lineStart).toBeGreaterThan(0);
  });

  it('R1: does NOT emit when model has @id field-level', async () => {
    const schema = `
model User {
  id    String @id @default(cuid()) @db.VarChar(36)
  email String @db.VarChar(255)
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.find((f) => f.tags.includes('R1_MISSING_ID'))).toBeUndefined();
  });

  it('R1: does NOT emit when model has @@id model-level', async () => {
    const schema = `
model Membership {
  userId String @db.VarChar(36)
  orgId  String @db.VarChar(36)
  @@id([userId, orgId])
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.find((f) => f.tags.includes('R1_MISSING_ID'))).toBeUndefined();
  });

  it('R2: emits P1 when a String field has no @db annotation', async () => {
    const schema = `
model Article {
  id    String @id @default(cuid())
  title String
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    const r2 = findings.find((f) => f.tags.includes('R2_STRING_NO_LENGTH'));
    expect(r2).toBeDefined();
    expect(r2!.severity).toBe('P1');
    expect(r2!.title).toContain('title');
  });

  it('R2: does NOT emit when @db.VarChar(N) is present', async () => {
    const schema = `
model Article {
  id    String @id @default(cuid())
  title String @db.VarChar(255)
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.find((f) => f.tags.includes('R2_STRING_NO_LENGTH'))).toBeUndefined();
  });

  it('R3: emits when relation is one-way (target has no back reference)', async () => {
    const schema = `
model User {
  id    String @id
  email String @db.VarChar(255)
}

model Order {
  id     String @id
  user   User
  total  Int
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    const r3 = findings.find((f) => f.tags.includes('R3_ONE_WAY_RELATION'));
    expect(r3).toBeDefined();
    expect(r3!.severity).toBe('P1');
    expect(r3!.title).toContain('Order');
    expect(r3!.title).toContain('User');
  });

  it('R3: does NOT emit when both sides reference each other', async () => {
    const schema = `
model User {
  id     String  @id
  orders Order[]
}

model Order {
  id    String @id
  user  User
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.find((f) => f.tags.includes('R3_ONE_WAY_RELATION'))).toBeUndefined();
  });

  it('R4: emits P2 when createdAt has no @default(now())', async () => {
    const schema = `
model Comment {
  id        String   @id @default(cuid())
  body      String   @db.Text
  createdAt DateTime
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    const r4 = findings.find((f) => f.tags.includes('R4_TIMESTAMP_MISSING'));
    expect(r4).toBeDefined();
    expect(r4!.severity).toBe('P2');
    expect(r4!.title).toContain('createdAt');
  });

  it('R4: does NOT emit when updatedAt has @updatedAt', async () => {
    const schema = `
model Comment {
  id        String   @id @default(cuid())
  body      String   @db.Text
  updatedAt DateTime @updatedAt
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.find((f) => f.tags.includes('R4_TIMESTAMP_MISSING'))).toBeUndefined();
  });

  it('R5: emits P0 when a password field has no length constraint', async () => {
    const schema = `
model Account {
  id       String @id @default(cuid())
  email    String @db.VarChar(255)
  password String
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    const r5 = findings.find((f) => f.tags.includes('R5_SENSITIVE_FIELD'));
    expect(r5).toBeDefined();
    expect(r5!.severity).toBe('P0');
    expect(r5!.title).toContain('password');
  });

  it('R5: also emits when apiKey is stored as @db.Text (likely plaintext)', async () => {
    const schema = `
model Account {
  id     String @id @default(cuid())
  apiKey String @db.Text
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    const r5 = findings.find((f) => f.tags.includes('R5_SENSITIVE_FIELD'));
    expect(r5).toBeDefined();
    expect(r5!.title).toContain('apiKey');
  });

  it('R6: emits when a userId-shaped column has no @relation', async () => {
    const schema = `
model Post {
  id     String @id @default(cuid())
  title  String @db.VarChar(200)
  userId String @db.VarChar(36)
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    const r6 = findings.find((f) => f.tags.includes('R6_FK_NO_RELATION'));
    expect(r6).toBeDefined();
    expect(r6!.severity).toBe('P1');
    expect(r6!.title).toContain('userId');
  });

  it('R6: does NOT emit when a sibling field has @relation(fields: [userId], ...)', async () => {
    const schema = `
model User {
  id    String @id
  posts Post[]
}

model Post {
  id     String @id @default(cuid())
  title  String @db.VarChar(200)
  userId String @db.VarChar(36)
  user   User   @relation(fields: [userId], references: [id])
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.find((f) => f.tags.includes('R6_FK_NO_RELATION'))).toBeUndefined();
  });

  it('returns empty array when reader throws (missing file)', async () => {
    const findings = await analyzePrismaSchema({
      schemaPath: '/missing.prisma',
      readFile: async () => {
        throw new Error('ENOENT');
      },
    });
    expect(findings).toEqual([]);
  });

  it('returns empty array when schema has no models', async () => {
    const schema = `
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings).toEqual([]);
  });

  it('every finding uses category DATA_MODEL and FILE evidence', async () => {
    const schema = `
model Post {
  title String
}
`;
    const findings = await analyzePrismaSchema({
      schemaPath: '/x.prisma',
      readFile: makeReader(schema),
    });
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.category).toBe('DATA_MODEL');
      expect(f.tags).toContain('prisma');
      expect(f.tags).toContain('data-model');
      expect(f.evidences.length).toBeGreaterThan(0);
      expect(f.evidences[0]!.type).toBe('FILE');
      expect(f.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });
});
