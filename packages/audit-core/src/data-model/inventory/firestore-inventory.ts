// Firestore Security Rules → DataModelInventory (PR-A2 / PRD §3.4).
//
// Firestore doesn't have a schema file the way Prisma does — collections are
// implicitly created when a document is first written. The closest thing to
// a "schema" is the security rules file, which enumerates every collection
// path the application authorises. That's the inventory we extract here.
//
// Rules syntax we parse:
//
//   match /<collection>/{docId}            → top-level collection
//   match /<collection>/{docId}/<sub>/{id} → subcollection
//
// We deliberately ignore:
//   - `match /databases/{database}/documents` wrapper (always present)
//   - `function` definitions
//   - request.auth / resource.data conditions (those are security, not inventory)
//
// Field count is reported as `null` because Firestore rules name collections
// but don't list document fields. `hasRelations` defaults to `false` for the
// same reason — Firestore relations are application-level, not declared in
// rules. The UI surfaces this transparently ("11 collections · field shapes
// not declared in rules") rather than fabricating numbers.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  DataModelEntity,
  DataModelInventory,
} from '@cleartoship/shared-types';

// `match /<segment>/{wildcard}` — segment captured in group 1.
// We avoid capturing the `/databases/{database}/documents` wrapper by
// requiring the segment NOT be a recognised wrapper keyword.
const MATCH_RE = /match\s+\/([A-Za-z_][\w-]*)\s*\/\s*\{[^}]+\}/g;
const WRAPPER_SEGMENTS = new Set(['databases', 'documents']);

interface ParsedRulesFile {
  sourceFile: string;
  collections: string[];
}

async function parseRulesFile(absPath: string, relPath: string): Promise<ParsedRulesFile> {
  const text = await fsp.readFile(absPath, 'utf8');
  const seen = new Set<string>();
  const collections: string[] = [];

  // Strip line comments + block comments first so `match /foo/{id}` inside a
  // comment doesn't show up as a real collection.
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  for (const m of stripped.matchAll(MATCH_RE)) {
    const segment = m[1];
    if (!segment) continue;
    if (WRAPPER_SEGMENTS.has(segment)) continue;
    if (seen.has(segment)) continue;
    seen.add(segment);
    collections.push(segment);
  }

  return { sourceFile: relPath, collections };
}

/**
 * Build a Firestore inventory from a list of `*.rules` paths (caller-supplied).
 * Returns `null` when the input is empty so the caller can fall through.
 */
export async function buildFirestoreInventory(
  clonePath: string,
  rulesPaths: string[]
): Promise<DataModelInventory | null> {
  if (rulesPaths.length === 0) return null;

  const allCollections: string[] = [];
  const seen = new Set<string>();
  const sourceFiles: string[] = [];

  for (const abs of rulesPaths) {
    const rel = path.relative(clonePath, abs);
    try {
      const parsed = await parseRulesFile(abs, rel);
      sourceFiles.push(parsed.sourceFile);
      for (const c of parsed.collections) {
        if (seen.has(c)) continue;
        seen.add(c);
        allCollections.push(c);
      }
    } catch {
      // Per-file failure is tolerated — emit the partial inventory.
    }
  }

  const entities: DataModelEntity[] = allCollections.map((name) => ({
    name,
    fieldCount: null,
    hasRelations: false,
    sourceFile: sourceFiles[0] ?? 'firestore.rules',
  }));

  return {
    tech: 'firestore',
    entities,
    sourceFiles,
    // Firestore rules accurately enumerate authorised collections — high
    // confidence on the "what collections exist" dimension. Field shapes
    // are application-level so we don't claim them.
    confidence: 'high',
  };
}
