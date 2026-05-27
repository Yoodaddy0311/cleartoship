import type { DataModelInventory } from '@cleartoship/shared-types';
import {
  scoreFromPatterns,
  type PatternEvidence,
  type PatternScoreResult,
} from './score-from-patterns.js';

/**
 * Audit Quality Roadmap §5.3 — DATA_MODEL Pattern Library.
 *
 * Phase 1.3 gave the category a coarse inventory *baseline* (60/75 keyed off
 * entity count, in `inventory-scoring.ts`). This module supersedes that with a
 * deterministic Pattern-Library score (origin 'D') derived purely from the
 * data-model inventory the source-driven-extraction pass already produced. No
 * LLM, no schema-file re-reading — only the `DataModelInventory` snapshot.
 *
 * HONESTY CONSTRAINT: an inventory built from a path/marker pass cannot see
 * index presence, migration history, normalization quality, or runtime query
 * patterns. Those are the deeper data-model signals §5.3 eventually wants, but
 * each needs schema *contents* or a live DB — neither of which this pass reads.
 * Scoring them here would be fabrication, so they are deferred to a future
 * content/DB pass (see docs/audit-patterns/data-model.md). We score only the
 * structural facts the inventory actually carries.
 */

export interface DataModelSignals {
  readonly dataModelInventory: DataModelInventory;
}

/**
 * Score impacts (§5.2). Entity count and the presence of relations are the
 * heaviest healthy signals (a connected, non-trivial model is the goal); a
 * statically-typed/declarative schema stack adds a real type-safety guarantee.
 * The one risk pattern (`DM-blob-risk`) is a small negative for a multi-entity
 * model with zero relations (possible denormalized blob store). Tuned so a rich
 * relational Prisma model (8 entities, relations, high confidence) lands ~80–92
 * and a single-entity schemaless store lands ~55–62 off a baseline of 50.
 */
const IMPACT = {
  entityCountStrong: 18, // >= 8 entities
  entityCountModest: 11, //  3–7 entities
  entityCountSmall: 5, //   1–2 entities
  relationsPresent: 12,
  relationsDensity: 8, // >= 50% of entities relational
  typedSchema: 9, // prisma / drizzle / sql
  fieldDetail: 6, // at least one resolved fieldCount
  multiSourceStrong: 5, // >= 3 schema source files
  multiSourceModest: 2, //  2 schema source files
  detectionConfidence: 4, // confidence === 'high'
  blobRisk: -7, // >=3 entities, zero relations
} as const;

/** Statically-typed / declarative schema stacks where the source itself is a
 * type/shape contract (compile-time or migration-checked). `firestore` and
 * `mongoose` are schemaless/loose by default → no bonus (honest: not a penalty,
 * just less of a type guarantee). */
const TYPED_SCHEMA_TECH = new Set<DataModelInventory['tech']>([
  'prisma',
  'drizzle',
  'sql',
]);

function entityCountPattern(count: number): PatternEvidence {
  if (count >= 8) {
    return {
      patternId: 'DM-entity-count',
      matched: true,
      scoreImpact: IMPACT.entityCountStrong,
      evidence: `${count} entities — substantial, well-developed data model`,
    };
  }
  if (count >= 3) {
    return {
      patternId: 'DM-entity-count',
      matched: true,
      scoreImpact: IMPACT.entityCountModest,
      evidence: `${count} entities — moderate data model`,
    };
  }
  // count is 1 or 2 here (callers return null before zero entities).
  return {
    patternId: 'DM-entity-count',
    matched: true,
    scoreImpact: IMPACT.entityCountSmall,
    evidence: `${count} ${count === 1 ? 'entity' : 'entities'} — minimal data model`,
  };
}

function multiSourcePattern(sourceCount: number): PatternEvidence {
  if (sourceCount >= 3) {
    return {
      patternId: 'DM-multi-source',
      matched: true,
      scoreImpact: IMPACT.multiSourceStrong,
      evidence: `${sourceCount} schema source files — modular schema`,
    };
  }
  if (sourceCount === 2) {
    return {
      patternId: 'DM-multi-source',
      matched: true,
      scoreImpact: IMPACT.multiSourceModest,
      evidence: '2 schema source files — schema split across files',
    };
  }
  return {
    patternId: 'DM-multi-source',
    matched: false,
    scoreImpact: IMPACT.multiSourceModest,
    evidence:
      sourceCount === 1
        ? 'single schema source file'
        : 'no schema source files recorded',
  };
}

/** Build the deterministic pattern set from the inventory (7 positive presence
 * signals + 1 risk signal). Only called when there is at least one entity. */
function buildPatterns(
  inventory: DataModelInventory,
): ReadonlyArray<PatternEvidence> {
  const { entities, tech, sourceFiles, confidence } = inventory;
  const entityCount = entities.length;
  const relationalEntities = entities.filter((e) => e.hasRelations).length;
  const hasAnyRelations = relationalEntities > 0;
  const relationsDensity = relationalEntities / entityCount;
  const denseRelations = relationsDensity >= 0.5;
  const typedSchema = TYPED_SCHEMA_TECH.has(tech);
  const fieldDetail = entities.some((e) => e.fieldCount !== null);
  const blobRisk = entityCount >= 3 && !hasAnyRelations;

  return [
    entityCountPattern(entityCount),
    {
      patternId: 'DM-relations-present',
      matched: hasAnyRelations,
      scoreImpact: IMPACT.relationsPresent,
      evidence: hasAnyRelations
        ? `${relationalEntities}/${entityCount} entities declare relations — relational model`
        : 'no entity declares relations',
    },
    {
      patternId: 'DM-relations-density',
      matched: denseRelations,
      scoreImpact: IMPACT.relationsDensity,
      evidence: denseRelations
        ? `${Math.round(relationsDensity * 100)}% of entities are relational — well-connected model`
        : `${Math.round(relationsDensity * 100)}% of entities relational (below 50%)`,
    },
    {
      patternId: 'DM-typed-schema',
      matched: typedSchema,
      scoreImpact: IMPACT.typedSchema,
      evidence: typedSchema
        ? `${tech} — statically-typed/declarative schema (compile/migration-checked)`
        : `${tech} — schemaless/loose schema (less type guarantee, not a penalty)`,
    },
    {
      patternId: 'DM-field-detail',
      matched: fieldDetail,
      scoreImpact: IMPACT.fieldDetail,
      evidence: fieldDetail
        ? 'field shapes resolved for at least one entity — schema detail known'
        : 'only entity names known — field shapes not resolved',
    },
    multiSourcePattern(sourceFiles.length),
    {
      patternId: 'DM-detection-confidence',
      matched: confidence === 'high',
      scoreImpact: IMPACT.detectionConfidence,
      evidence:
        confidence === 'high'
          ? 'unambiguous schema markers — high detection confidence'
          : `detection confidence: ${confidence}`,
    },
    {
      patternId: 'DM-blob-risk',
      matched: blobRisk,
      scoreImpact: IMPACT.blobRisk,
      evidence: blobRisk
        ? `RISK: ${entityCount} entities with zero relations — possible denormalized blob model`
        : 'no blob-model risk (relations present or few entities)',
    },
  ];
}

/**
 * Score the data model from its inventory snapshot.
 *
 * Returns `null` when `tech === 'none'` OR there are zero entities — "no DB" is
 * an accurate result the UI surfaces directly (정확한 결과), not an N/A score.
 * Otherwise returns a deterministic PatternScoreResult (origin 'D').
 */
export function scoreDataModel(
  s: DataModelSignals,
): PatternScoreResult | null {
  const { dataModelInventory } = s;
  if (
    dataModelInventory.tech === 'none' ||
    dataModelInventory.entities.length === 0
  ) {
    return null;
  }
  return scoreFromPatterns(buildPatterns(dataModelInventory));
}
