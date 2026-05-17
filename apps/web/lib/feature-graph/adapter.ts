/**
 * Feature-graph node ↔ finding adapter.
 *
 * Linking contract (per packages/shared-types/src/domain.ts):
 *
 *   FeatureNode.evidenceIds ──┐
 *                             ├── joined on Evidence.id
 *   Evidence.findingId  ──────┘
 *
 * GraphCanvas needs `Record<nodeId, findingId[]>` to decide click behavior:
 *   - 0 ids: announce "no findings", selection still works
 *   - 1 id:  navigate directly to /audits/[id]/findings/[findingId]
 *   - 2+ ids: open FindingPopover for the user to pick
 *
 * This module is pure — it does not import React, fetch, or any UI types so
 * it can be unit tested with plain object fixtures.
 */

/** Minimal node shape required for the join — keeps the adapter decoupled. */
export interface AdapterNode {
  id: string;
  /** Evidence ids associated with this node. Optional / may be empty. */
  evidenceIds?: ReadonlyArray<string>;
}

/** Minimal evidence shape required for the join. */
export interface AdapterEvidence {
  id: string;
  /** Null when the evidence is unassociated (e.g. screenshot scratch space). */
  findingId: string | null;
}

/**
 * Build a map of `nodeId → unique findingId[]` by joining nodes through their
 * evidence references. Nodes with zero resolved findings are omitted so the
 * consumer can rely on `map[nodeId]?.length` for branching.
 *
 * Determinism: finding ids appear in the order their evidence ids appear on
 * the source node. Duplicates (same finding reached via multiple evidences)
 * are collapsed to the first occurrence.
 */
export function buildFindingIdsByNode(
  nodes: ReadonlyArray<AdapterNode>,
  evidences: ReadonlyArray<AdapterEvidence>,
): Record<string, string[]> {
  // Build an evidence lookup once; the outer loop is otherwise O(N·M).
  const evidenceFindingById = new Map<string, string | null>();
  for (const ev of evidences) {
    evidenceFindingById.set(ev.id, ev.findingId);
  }

  const result: Record<string, string[]> = {};
  for (const node of nodes) {
    const evidenceIds = node.evidenceIds ?? [];
    if (evidenceIds.length === 0) continue;

    const seen = new Set<string>();
    const findingIds: string[] = [];
    for (const evidenceId of evidenceIds) {
      const findingId = evidenceFindingById.get(evidenceId);
      // Missing evidence (id not in map) or unlinked evidence (null) → skip.
      if (findingId == null) continue;
      if (seen.has(findingId)) continue;
      seen.add(findingId);
      findingIds.push(findingId);
    }
    if (findingIds.length > 0) {
      result[node.id] = findingIds;
    }
  }

  return result;
}
