// Source-driven extraction Phase A4 (PRD source-driven-extraction-2026-05-20 §3.4).
//
// Unified inventory of the audited repo's data model — what DB tech is in use
// (if any), how many entities/tables/collections exist, and a coarse signal
// about relationships. Designed to be DB-stack-agnostic so the report can say
// "11 Firestore collections detected" the same way it says "8 Prisma models
// detected" without the UI needing per-stack branches.
//
// Distinct from the existing `prisma-analyzer` which emits *findings* (security
// / quality issues per model). This module emits a *snapshot* — the structural
// facts the scoring + UI need to stop returning N/A for the 데이터 모델 category.
//
// MVP coverage in PR-A2:
//   - prisma  (extends existing analyzer)
//   - firestore (Firestore Security Rules → collection inventory)
//
// Phase-2 follow-up (separate PR):
//   - drizzle (drizzle-orm `pgTable` / `mysqlTable` / `sqliteTable`)
//   - sql migration (CREATE TABLE statements in migrations/*.sql)
//   - mongoose / typeorm / supabase
//
// `none` means "scanned the repo and found no recognised schema sources".
// The UI uses that to flip the 데이터 모델 category from "분석 자료 부족"
// (N/A) to "이 프로젝트는 DB 없음" (정확한 결과).

import { z } from 'zod';

export const DataModelTechSchema = z.enum([
  'prisma',
  'firestore',
  'drizzle', // reserved for follow-up
  'sql', // reserved for follow-up
  'mongoose', // reserved for follow-up
  'none',
]);
export type DataModelTech = z.infer<typeof DataModelTechSchema>;

export const DataModelEntitySchema = z.object({
  /** Entity/table/collection name as it appears in source. */
  name: z.string(),
  /**
   * Field/column count when the parser can determine it. `null` for stacks
   * where the count isn't directly available (e.g. Firestore rules name
   * collections but don't list document shapes).
   */
  fieldCount: z.number().int().nonnegative().nullable(),
  /**
   * `true` when the parser saw at least one explicit relation declaration
   * (FK, `@relation`, etc.). Used as a coarse "is the model just a blob or
   * is it relational" hint.
   */
  hasRelations: z.boolean(),
  /** Source file relative to the cloned repo root, for evidence citation. */
  sourceFile: z.string(),
});
export type DataModelEntity = z.infer<typeof DataModelEntitySchema>;

export const DataModelInventorySchema = z.object({
  /** Detected stack. `none` when no recognised schema is found. */
  tech: DataModelTechSchema,
  /** Discovered entities. Empty array when `tech === 'none'`. */
  entities: z.array(DataModelEntitySchema),
  /**
   * The schema file paths the parser consumed, for evidence citation. Empty
   * when `tech === 'none'`. Multiple paths possible (e.g. several
   * `*.prisma` files or `firestore.rules` + collection-specific rules).
   */
  sourceFiles: z.array(z.string()),
  /**
   * Coarse confidence in the detection. `high` = unambiguous file marker
   * (e.g. `prisma/schema.prisma` present). `medium` = heuristic match.
   * `low` = ambiguous signal that may want human review.
   */
  confidence: z.enum(['high', 'medium', 'low']),
});
export type DataModelInventory = z.infer<typeof DataModelInventorySchema>;

export const EMPTY_DATA_MODEL_INVENTORY: DataModelInventory = {
  tech: 'none',
  entities: [],
  sourceFiles: [],
  confidence: 'high',
};
