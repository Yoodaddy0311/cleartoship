# Audit Pattern Library — Data Model

> Category: `DATA_MODEL` · Origin: `D` (deterministic) ·
> Source module: `packages/audit-core/src/patterns/data-model-patterns.ts`

## Overview

**What it measures.** How well the project's persistence layer is structured —
whether it has a real, connected, typed data model versus a flat pile of
collections (or no database at all).

**Why it matters.** A coherent data model is the backbone of most products.
Vibe-coded projects often grow a schema by accretion: a handful of disconnected
collections with no declared relationships, no type guarantees, and no clear
field shapes. Such a model runs but is fragile to evolve and easy to corrupt.
Surfacing that to the founder before launch is the point of this category.

**Phase 1.3 baseline supersession.** Earlier (`inventory-scoring.ts`),
`DATA_MODEL` received a coarse inventory *baseline* — roughly 60 or 75 keyed off
raw entity count. This Pattern-Library module **supersedes** that baseline with a
finer-grained deterministic score (Roadmap §5.5): start from a `baseline` of 50,
then add/subtract a fixed `scoreImpact` for each matched pattern. Entity count
and the presence of relations carry the heaviest positive weights; a multi-entity
model with zero relations is modeled as its own small negative pattern
(`DM-blob-risk`). The aggregate is clamped to 0–100. Confidence is `HIGH` because
the module always evaluates 8 patterns (above the §5.5 HIGH threshold of 5).

**Inputs (prod-available only).** Only the `DataModelInventory` snapshot the
source-driven-extraction pass produced:
- `tech` — detected stack (`prisma` / `firestore` / `drizzle` / `sql` /
  `mongoose` / `none`).
- `entities[]` — `{ name, fieldCount, hasRelations, sourceFile }`.
- `sourceFiles[]` — the schema files the parser consumed.
- `confidence` — `high` / `medium` / `low` detection confidence.

No LLM, no network, and no re-reading of the schema files themselves — the score
is derived entirely from the inventory.

**Returns `null` (no score)** when `tech === 'none'` **or** there are zero
entities. "No database" is an *accurate* result the UI surfaces directly
(정확한 결과: "이 프로젝트는 DB 없음"), not an N/A / "분석 자료 부족" state.

**Explicitly deferred (NOT scored here) — honesty note.** A path/inventory pass
**cannot** observe several signals §5.3 eventually wants:
- **Index presence** — whether queried columns/fields are indexed.
- **Migration history** — whether the schema evolves via tracked migrations.
- **Normalization quality** — beyond the coarse `hasRelations` flag.
- **Query patterns / N+1 risk** — needs runtime or application-code analysis.

Every one of these requires reading schema **file contents** or inspecting a live
**database** — neither of which this deterministic pass does. Scoring them here
would be fabrication, so they are deferred to a future content/DB pass and
intentionally omitted to keep the score honest.

## Patterns

Seven positive presence signals plus one risk signal (8 total). All are pure
checks over the `DataModelInventory` snapshot — no schema contents, no DB, no
LLM. Patterns are only built when there is at least one entity (the `none` /
zero-entity case returns `null` before any pattern is evaluated).

### DM-entity-count
- **When to suspect**: a trivially small or, conversely, substantial data model.
- **Test (deterministic signal)**: `entities.length` tiered.
- **Validation**: always matched (there is ≥1 entity). Impact by tier:
  `>=8` → +18 (substantial); `3–7` → +11 (moderate); `1–2` → +5 (minimal).
- **Score impact**: +5 / +11 / +18 by tier.

### DM-relations-present
- **When to suspect**: a flat model of disconnected blobs.
- **Test (deterministic signal)**: at least one entity has `hasRelations === true`.
- **Validation**: matched when any entity declares a relation.
- **Score impact**: +12 (a relational model, not flat blobs).

### DM-relations-density
- **When to suspect**: a mostly-flat model with one token relation.
- **Test (deterministic signal)**: fraction of entities with `hasRelations` is
  `>= 0.5`.
- **Validation**: matched when at least half the entities are relational —
  evidence of a genuinely well-connected model, not a single stray FK.
- **Score impact**: +8 (additive on top of `DM-relations-present`).

### DM-typed-schema
- **When to suspect**: a schemaless store with no compile-time type guarantee.
- **Test (deterministic signal)**: `tech` is `prisma`, `drizzle`, or `sql` — a
  statically-typed / declarative schema stack whose source is itself a
  compile-/migration-checked contract.
- **Validation**: matched for those stacks. `firestore` and `mongoose` are
  schemaless/loose by default and **do not match** — this is **not a penalty**
  (the pattern simply contributes 0), just the honest absence of a type
  guarantee.
- **Score impact**: +9 when matched.

### DM-field-detail
- **When to suspect**: only collection/table names are known, not their shapes.
- **Test (deterministic signal)**: at least one entity has a non-null
  `fieldCount` (the parser resolved field shapes).
- **Validation**: matched when field detail exists for ≥1 entity — the schema is
  known at the field level, not just as a list of names.
- **Score impact**: +6.

### DM-multi-source
- **When to suspect**: n/a — this is a small positive for a modular schema.
- **Test (deterministic signal)**: `sourceFiles.length` tiered.
- **Validation**: matched for `>=3` (+5, modular schema) or `==2` (+2, split
  across files). A single source file does **not** match.
- **Score impact**: +2 / +5 by tier.

### DM-detection-confidence
- **When to suspect**: ambiguous schema markers that may want human review.
- **Test (deterministic signal)**: `confidence === 'high'`.
- **Validation**: matched only for `high` (unambiguous markers, e.g.
  `prisma/schema.prisma`). `medium` / `low` do not match.
- **Score impact**: +4 (small).

### DM-blob-risk (RISK)
- **When to suspect**: several entities with no declared relationships at all —
  a possible denormalized "everything in one document" blob model.
- **Test (deterministic signal)**: `entities.length >= 3` **and** no entity has
  `hasRelations === true`.
- **Validation**: matched only for a multi-entity, zero-relation model. A 1–2
  entity flat model is too small to flag.
- **Score impact**: −7 (the one negative — a small honesty nudge, not a heavy
  penalty, since a flat model can be legitimate).

## Score formula

```
score = clamp( 50                                        (baseline)
             +  5 / 11 / 18  DM-entity-count        (1–2 / 3–7 / >=8 entities)
             + 12            DM-relations-present    (any entity hasRelations)
             +  8            DM-relations-density    (>= 50% entities relational)
             +  9            DM-typed-schema         (prisma | drizzle | sql)
             +  6            DM-field-detail         (any non-null fieldCount)
             +  2 / 5        DM-multi-source         (2 / >=3 source files)
             +  4            DM-detection-confidence (confidence === 'high')
             -  7            DM-blob-risk            (>=3 entities, 0 relations)
             , 0, 100 )
```

**Reference points.**
- Rich relational Prisma model (8 entities, all relational, field shapes known,
  high confidence, single schema file): `50 + 18 + 12 + 8 + 9 + 6 + 0 + 4 = 107
  → clamped 100` (top of the ≥80 "healthy" band).
- Single-entity schemaless store (Firestore, 1 collection, no relations, no field
  detail, medium confidence): `50 + 5 = 55` (low-but-honest 55–62 band — it *is*
  a data model, just a minimal, untyped one).
- Multi-entity flat blob (Prisma, 4 entities, zero relations, field detail, high
  confidence): `50 + 11 + 0 + 0 + 9 + 6 + 0 + 4 − 7 = 73`, strictly below the
  same model with relations.

Returns `null` (→ "no DB", an accurate result) when `tech === 'none'` or there
are zero entities.
