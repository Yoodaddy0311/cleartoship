// Data-model stack detection + dispatch (PR-A2 / PRD §3.4).
//
// Walks the cloned repo's file system to find schema sources, picks the
// dominant stack, and returns a unified `DataModelInventory`. When no
// recognised schema is found, returns the EMPTY snapshot with `tech: 'none'`
// — that's a valid result (e.g. cleartoship itself uses Firestore so the
// `prisma` branch is inapplicable). The UI surfaces 'none' as "이 프로젝트는
// DB 스키마 없음" rather than the misleading "분석 자료 부족" N/A.
//
// Detection precedence:
//   1. Prisma   — `prisma/schema.prisma` or any `*.prisma` outside node_modules
//   2. Firestore — `*.rules` files (any of `firestore.rules`, `*.rules`)
//   3. (none)   — no recognised source
//
// Multi-stack repos: when both Prisma + Firestore are present (rare but
// possible — e.g. legacy + new system), Prisma wins because it has stronger
// field-level data. Operators can spot the Firestore overlap in the file
// listing.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import {
  EMPTY_DATA_MODEL_INVENTORY,
  type DataModelInventory,
} from '@cleartoship/shared-types';
import { buildPrismaInventory } from './prisma-inventory.js';
import { buildFirestoreInventory } from './firestore-inventory.js';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.turbo', 'dist', 'build', '.cache']);

interface DiscoveryResult {
  prismaPaths: string[];
  firestoreRulesPaths: string[];
}

async function discoverSchemaFiles(clonePath: string): Promise<DiscoveryResult> {
  const prismaPaths: string[] = [];
  const firestoreRulesPaths: string[] = [];

  async function walk(dir: string, depth: number): Promise<void> {
    // Hard cap on traversal depth — guards against pathological symlink loops
    // even though we don't follow symlinks. 10 levels is well past anything
    // a sane project needs.
    if (depth > 10) return;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(full, depth + 1);
        continue;
      }
      if (!e.isFile()) continue;
      if (e.name.endsWith('.prisma')) {
        prismaPaths.push(full);
      } else if (e.name.endsWith('.rules')) {
        // Firestore rules use the `.rules` extension. Storage rules also use
        // it but those don't describe collections; the inventory parser
        // sees no `match /collection/...` and returns 0 collections, which
        // is fine.
        firestoreRulesPaths.push(full);
      }
    }
  }

  await walk(clonePath, 0);
  return { prismaPaths, firestoreRulesPaths };
}

/**
 * Top-level entry point. Discovers schema files in the cloned repo, picks
 * the dominant stack, and returns the unified inventory. Never throws —
 * returns `EMPTY_DATA_MODEL_INVENTORY` on any unexpected error so the
 * pipeline can continue.
 */
export async function detectDataModelInventory(
  clonePath: string
): Promise<DataModelInventory> {
  try {
    const { prismaPaths, firestoreRulesPaths } = await discoverSchemaFiles(clonePath);

    if (prismaPaths.length > 0) {
      const inv = await buildPrismaInventory(clonePath, prismaPaths);
      if (inv) return inv;
    }

    if (firestoreRulesPaths.length > 0) {
      const inv = await buildFirestoreInventory(clonePath, firestoreRulesPaths);
      if (inv) return inv;
    }

    return EMPTY_DATA_MODEL_INVENTORY;
  } catch {
    return EMPTY_DATA_MODEL_INVENTORY;
  }
}
