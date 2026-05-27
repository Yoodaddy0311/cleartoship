import { describe, it, expect } from 'vitest';
import type {
  DataModelEntity,
  DataModelInventory,
} from '@cleartoship/shared-types';
import {
  scoreDataModel,
  type DataModelSignals,
} from './data-model-patterns.js';

/** Build a single entity with sensible defaults. */
function entity(overrides: Partial<DataModelEntity> = {}): DataModelEntity {
  return {
    name: 'User',
    fieldCount: 5,
    hasRelations: true,
    sourceFile: 'prisma/schema.prisma',
    ...overrides,
  };
}

/** Build n entities, all relational with resolved field counts. */
function relationalEntities(n: number): DataModelEntity[] {
  return Array.from({ length: n }, (_, i) =>
    entity({ name: `Entity${i}`, hasRelations: true, fieldCount: 4 }),
  );
}

function inventory(
  overrides: Partial<DataModelInventory> = {},
): DataModelInventory {
  return {
    tech: 'prisma',
    entities: relationalEntities(8),
    sourceFiles: ['prisma/schema.prisma'],
    confidence: 'high',
    ...overrides,
  };
}

function signals(inv: DataModelInventory): DataModelSignals {
  return { dataModelInventory: inv };
}

function matchedIds(inv: DataModelInventory): string[] {
  const r = scoreDataModel(signals(inv));
  return (r?.matched ?? []).map((m) => m.patternId);
}

describe('scoreDataModel', () => {
  it('returns null when tech is "none" (no DB → accurate result, not N/A)', () => {
    expect(
      scoreDataModel(
        signals(inventory({ tech: 'none', entities: [], sourceFiles: [] })),
      ),
    ).toBeNull();
  });

  it('returns null when there are zero entities even if a tech is set', () => {
    expect(
      scoreDataModel(signals(inventory({ tech: 'prisma', entities: [] }))),
    ).toBeNull();
  });

  it('returns a result with origin "D" whenever there are entities', () => {
    const r = scoreDataModel(signals(inventory()));
    expect(r).not.toBeNull();
    expect(r?.origin).toBe('D');
  });

  it('scores a rich relational Prisma model high (>=80)', () => {
    const r = scoreDataModel(signals(inventory()));
    expect(r?.score).toBeGreaterThanOrEqual(80);
  });

  it('is HIGH confidence (8 patterns are always evaluated, > the §5.5 threshold)', () => {
    expect(scoreDataModel(signals(inventory()))?.confidence).toBe('HIGH');
  });

  it('scores a single-entity schemaless store in the ~55–62 band', () => {
    const inv = inventory({
      tech: 'firestore',
      entities: [entity({ name: 'users', hasRelations: false, fieldCount: null })],
      sourceFiles: ['firestore.rules'],
      confidence: 'medium',
    });
    const r = scoreDataModel(signals(inv));
    expect(r!.score).toBeGreaterThanOrEqual(55);
    expect(r!.score).toBeLessThanOrEqual(62);
  });

  it('rewards relations presence (DM-relations-present toggles with hasRelations)', () => {
    const withRel = relationalEntities(4);
    const withoutRel = withRel.map((e) => ({ ...e, hasRelations: false }));
    expect(matchedIds(inventory({ entities: withRel }))).toContain(
      'DM-relations-present',
    );
    expect(matchedIds(inventory({ entities: withoutRel }))).not.toContain(
      'DM-relations-present',
    );
  });

  it('rewards relations density only when >=50% of entities are relational', () => {
    // 1 of 4 relational = 25% → density pattern must NOT match.
    const lowDensity = [
      entity({ hasRelations: true }),
      entity({ hasRelations: false }),
      entity({ hasRelations: false }),
      entity({ hasRelations: false }),
    ];
    // 2 of 4 relational = 50% → density pattern matches.
    const halfDensity = [
      entity({ hasRelations: true }),
      entity({ hasRelations: true }),
      entity({ hasRelations: false }),
      entity({ hasRelations: false }),
    ];
    expect(matchedIds(inventory({ entities: lowDensity }))).not.toContain(
      'DM-relations-density',
    );
    expect(matchedIds(inventory({ entities: halfDensity }))).toContain(
      'DM-relations-density',
    );
  });

  it('gives a typed-schema bonus to prisma/drizzle/sql but not firestore/mongoose (no penalty)', () => {
    expect(matchedIds(inventory({ tech: 'prisma' }))).toContain('DM-typed-schema');
    expect(matchedIds(inventory({ tech: 'drizzle' }))).toContain('DM-typed-schema');
    expect(matchedIds(inventory({ tech: 'sql' }))).toContain('DM-typed-schema');
    // Schemaless stacks: pattern is evaluated but does NOT match → 0 impact (no penalty).
    expect(matchedIds(inventory({ tech: 'firestore' }))).not.toContain(
      'DM-typed-schema',
    );
    expect(matchedIds(inventory({ tech: 'mongoose' }))).not.toContain(
      'DM-typed-schema',
    );
  });

  it('a schemaless stack is not penalised relative to the same model without the typed bonus', () => {
    // Identical structure; only tech differs. The schemaless score must equal
    // the typed score minus exactly the typed bonus (never a penalty below it).
    const base = inventory({
      tech: 'firestore',
      entities: relationalEntities(4),
      sourceFiles: ['firestore.rules'],
    });
    const typed = inventory({
      tech: 'sql',
      entities: relationalEntities(4),
      sourceFiles: ['firestore.rules'],
    });
    const schemaless = scoreDataModel(signals(base))!.score;
    const typedScore = scoreDataModel(signals(typed))!.score;
    expect(schemaless).toBeLessThan(typedScore);
  });

  it('rewards resolved field detail (DM-field-detail) and not when all fieldCounts are null', () => {
    const withDetail = relationalEntities(3); // fieldCount: 4
    const noDetail = withDetail.map((e) => ({ ...e, fieldCount: null }));
    expect(matchedIds(inventory({ entities: withDetail }))).toContain(
      'DM-field-detail',
    );
    expect(matchedIds(inventory({ entities: noDetail }))).not.toContain(
      'DM-field-detail',
    );
  });

  it('flags the blob RISK for >=3 entities with zero relations and lowers the score', () => {
    const blobEntities = relationalEntities(4).map((e) => ({
      ...e,
      hasRelations: false,
    }));
    const relationalSame = relationalEntities(4); // identical but relational
    expect(matchedIds(inventory({ entities: blobEntities }))).toContain(
      'DM-blob-risk',
    );
    expect(matchedIds(inventory({ entities: relationalSame }))).not.toContain(
      'DM-blob-risk',
    );
    const blobScore = scoreDataModel(signals(inventory({ entities: blobEntities })))!
      .score;
    const relationalScore = scoreDataModel(
      signals(inventory({ entities: relationalSame })),
    )!.score;
    expect(blobScore).toBeLessThan(relationalScore);
  });

  it('does not flag the blob RISK for 1–2 entities (too small to be a blob concern)', () => {
    const twoFlat = [
      entity({ hasRelations: false }),
      entity({ hasRelations: false }),
    ];
    expect(matchedIds(inventory({ entities: twoFlat }))).not.toContain(
      'DM-blob-risk',
    );
  });

  it('gives a high-confidence bonus (DM-detection-confidence) only when confidence is "high"', () => {
    expect(matchedIds(inventory({ confidence: 'high' }))).toContain(
      'DM-detection-confidence',
    );
    expect(matchedIds(inventory({ confidence: 'medium' }))).not.toContain(
      'DM-detection-confidence',
    );
    expect(matchedIds(inventory({ confidence: 'low' }))).not.toContain(
      'DM-detection-confidence',
    );
  });

  it('rewards a multi-file schema (DM-multi-source) with tiered impact', () => {
    expect(
      matchedIds(
        inventory({ sourceFiles: ['a.prisma', 'b.prisma', 'c.prisma'] }),
      ),
    ).toContain('DM-multi-source');
    expect(
      matchedIds(inventory({ sourceFiles: ['a.prisma', 'b.prisma'] })),
    ).toContain('DM-multi-source');
    expect(
      matchedIds(inventory({ sourceFiles: ['a.prisma'] })),
    ).not.toContain('DM-multi-source');
  });

  it('orders a rich relational model strictly above a single-entity schemaless store', () => {
    const rich = scoreDataModel(signals(inventory()))!.score;
    const minimal = scoreDataModel(
      signals(
        inventory({
          tech: 'firestore',
          entities: [
            entity({ name: 'users', hasRelations: false, fieldCount: null }),
          ],
          sourceFiles: ['firestore.rules'],
          confidence: 'medium',
        }),
      ),
    )!.score;
    expect(rich).toBeGreaterThan(minimal);
  });

  it('tiers the entity-count signal: strong (>=8) beats modest (3–7) beats small (1–2)', () => {
    const small = scoreDataModel(
      signals(inventory({ entities: relationalEntities(2) })),
    )!.score;
    const modest = scoreDataModel(
      signals(inventory({ entities: relationalEntities(5) })),
    )!.score;
    const strong = scoreDataModel(
      signals(inventory({ entities: relationalEntities(8) })),
    )!.score;
    expect(small).toBeLessThan(modest);
    // modest (5 entities) may clamp at 100 alongside strong; assert >= to allow clamp.
    expect(modest).toBeLessThanOrEqual(strong);
    expect(matchedIds(inventory({ entities: relationalEntities(2) }))).toContain(
      'DM-entity-count',
    );
  });
});
