/**
 * Deterministic LAYERED layout for the feature-graph (기능 관계도) canvas.
 *
 * Feature-graph nodes carry no persisted (x, y). Rather than a naive grid, we
 * synthesize a layered layout BY NODE TYPE so the graph reads top→bottom:
 *
 *   rank 0  Pages / product areas     (entry surfaces)
 *   rank 1  Components                (UI building blocks)
 *   rank 2  Server Actions + APIs + external services + auth guards
 *   rank 3  Data models               (persistence)
 *   rank 4  Other / unknown           (features, state, recommendations)
 *
 * Pure & deterministic: no Math.random, no Date, no input mutation. Same input
 * always yields the same Map. No external layout deps (dagre/elk).
 */
import type { FeatureNode, FeatureNodeType } from '@cleartoship/shared-types';

// Layout constants. NODE_W mirrors the rendered FeatureGraphNode width so the
// even column spacing lines up visually with the ReactFlow node boxes.
const NODE_W = 164;
const COL_GAP = 56;
const ROW_H = 150;
const X_ORIGIN = 40;
const Y_ORIGIN = 40;
const COL_STRIDE = NODE_W + COL_GAP;

/** node.type → vertical rank. Unmapped types fall through to TRAILING_RANK. */
const RANK_BY_TYPE: Record<FeatureNodeType, number> = {
  page: 0,
  product_area: 0,
  component: 1,
  action: 2,
  api: 2,
  external_service: 2,
  auth_guard: 2,
  data_model: 3,
  feature: 4,
  state: 4,
  recommended_feature: 4,
};

const TRAILING_RANK = 4;

function rankOf(type: FeatureNodeType): number {
  return RANK_BY_TYPE[type] ?? TRAILING_RANK;
}

/**
 * Lay nodes out in type-based horizontal rows, each rank centered relative to
 * the widest rank. Returns a new Map<id, {x, y}>; the input array is untouched.
 */
export function layoutLayered(
  nodes: FeatureNode[]
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  if (nodes.length === 0) return positions;

  // Bucket by rank, sorting each rank deterministically by id (no mutation:
  // copy before sort). Track the widest rank to center narrower ones.
  const buckets = new Map<number, FeatureNode[]>();
  for (const node of nodes) {
    const rank = rankOf(node.type);
    const bucket = buckets.get(rank) ?? [];
    bucket.push(node);
    buckets.set(rank, bucket);
  }

  let widest = 0;
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.id.localeCompare(b.id));
    if (bucket.length > widest) widest = bucket.length;
  }

  for (const [rank, bucket] of buckets) {
    // Center this row: offset so a row of N nodes is centered over `widest`.
    const offset = ((widest - bucket.length) * COL_STRIDE) / 2;
    bucket.forEach((node, col) => {
      positions.set(node.id, {
        x: X_ORIGIN + offset + col * COL_STRIDE,
        y: Y_ORIGIN + rank * ROW_H,
      });
    });
  }

  return positions;
}
