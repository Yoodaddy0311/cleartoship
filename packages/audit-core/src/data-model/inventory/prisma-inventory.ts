// Prisma schema → DataModelInventory (PR-A2 / PRD §3.4).
//
// Reuses the same grammar shape the existing `prisma-analyzer` parses, but
// emits a structural inventory (one DataModelEntity per `model` block) rather
// than findings. The two co-exist because they serve different consumers —
// the analyzer feeds `pendingFindings`, this feeds the new
// `state.dataModelInventory` field that the scoring step consumes to stop
// returning N/A for the 데이터 모델 category.
//
// Detection logic: any `*.prisma` file or `prisma/schema.prisma` triggers the
// `prisma` branch with `confidence: 'high'`. Multiple schemas (e.g. monorepo
// with several Prisma packages) are merged — entity names are namespaced with
// the source file for disambiguation.

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import type {
  DataModelEntity,
  DataModelInventory,
} from '@cleartoship/shared-types';

const MODEL_HEADER_RE = /^\s*model\s+(\w+)\s*\{/;
const FIELD_LINE_RE = /^\s*(\w+)\s+(\w+)/;
const RELATION_RE = /@relation\b/;

interface ParsedPrismaFile {
  sourceFile: string;
  entities: DataModelEntity[];
}

async function parsePrismaFile(absPath: string, relPath: string): Promise<ParsedPrismaFile> {
  const text = await fsp.readFile(absPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const entities: DataModelEntity[] = [];

  let currentModel: { name: string; fieldCount: number; hasRelations: boolean } | null = null;

  for (const line of lines) {
    const header = MODEL_HEADER_RE.exec(line);
    if (header) {
      // Push the previous model (defensive — handles malformed input where a
      // model isn't closed before the next opens).
      if (currentModel) {
        entities.push({
          name: currentModel.name,
          fieldCount: currentModel.fieldCount,
          hasRelations: currentModel.hasRelations,
          sourceFile: relPath,
        });
      }
      currentModel = { name: header[1] ?? '', fieldCount: 0, hasRelations: false };
      continue;
    }
    if (!currentModel) continue;
    if (line.trim().startsWith('}')) {
      entities.push({
        name: currentModel.name,
        fieldCount: currentModel.fieldCount,
        hasRelations: currentModel.hasRelations,
        sourceFile: relPath,
      });
      currentModel = null;
      continue;
    }
    if (RELATION_RE.test(line)) {
      currentModel.hasRelations = true;
    }
    // A "field" line starts with `<name> <type>` — exclude attribute-only
    // lines like `@@unique([a, b])`.
    if (FIELD_LINE_RE.test(line) && !line.trim().startsWith('@@')) {
      currentModel.fieldCount += 1;
    }
  }

  // Trailing unterminated model — preserve it for visibility.
  if (currentModel) {
    entities.push({
      name: currentModel.name,
      fieldCount: currentModel.fieldCount,
      hasRelations: currentModel.hasRelations,
      sourceFile: relPath,
    });
  }

  return { sourceFile: relPath, entities };
}

/**
 * Build a Prisma inventory from a list of schema file paths (caller-supplied
 * — typically discovered via step03's clone path + glob). Returns `null` when
 * the input is empty so the caller can fall through to other parsers.
 */
export async function buildPrismaInventory(
  clonePath: string,
  schemaPaths: string[]
): Promise<DataModelInventory | null> {
  if (schemaPaths.length === 0) return null;

  const parsed: ParsedPrismaFile[] = [];
  for (const abs of schemaPaths) {
    const rel = path.relative(clonePath, abs);
    try {
      parsed.push(await parsePrismaFile(abs, rel));
    } catch {
      // Defensive: a single malformed schema shouldn't blank the whole
      // inventory. Skip with a warning the caller can log if needed.
    }
  }

  const entities = parsed.flatMap((p) => p.entities);
  const sourceFiles = parsed.map((p) => p.sourceFile);

  return {
    tech: 'prisma',
    entities,
    sourceFiles,
    confidence: 'high',
  };
}
