// ANALYZE_DATA_MODEL — scans Prisma schema files in the cloned working
// tree and emits NormalizedFindings for the DATA_MODEL audit category.
// Skips gracefully when no clone path or no schema files are present.

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { Step } from './index.js';
import { analyzePrismaSchema } from '@cleartoship/audit-core';
import { writeToolResult } from '../../firestore/writers.js';

const SCHEMA_FILENAME = 'schema.prisma';
const PRISMA_DIR = 'prisma';

async function findPrismaSchemas(root: string): Promise<string[]> {
  const found: string[] = [];
  const stack: string[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < 2_000) {
    const dir = stack.pop()!;
    visited++;
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (
          e.name === '.git' ||
          e.name === 'node_modules' ||
          e.name === 'dist' ||
          e.name === 'build' ||
          e.name === '.next'
        ) {
          continue;
        }
        stack.push(full);
      } else if (e.isFile()) {
        if (e.name === SCHEMA_FILENAME || (e.name.endsWith('.prisma') && path.basename(dir) === PRISMA_DIR)) {
          found.push(full);
        }
      }
    }
  }
  return found;
}

export const step16AnalyzeDataModel: Step = {
  step: 'ANALYZE_DATA_MODEL',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Data model analysis skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'prisma-analyzer',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const schemas = await findPrismaSchemas(ctx.clonePath);
    if (schemas.length === 0) {
      ctx.log('info', 'No Prisma schema found; skipping data model analysis');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'prisma-analyzer',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'no prisma schema found' },
        artifactPath: null,
      });
      return;
    }

    let totalFindings = 0;
    for (const schemaPath of schemas) {
      try {
        const findings = await analyzePrismaSchema({ schemaPath });
        state.pendingFindings.push(...findings);
        totalFindings += findings.length;
      } catch (e) {
        ctx.log('warn', 'analyzePrismaSchema failed', {
          schemaPath,
          error: (e as Error).message,
        });
      }
    }

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'prisma-analyzer',
      toolVersion: '1.0.0',
      status: 'SUCCESS',
      rawSummary: {
        findings: totalFindings,
        schemasScanned: schemas.length,
      },
      artifactPath: null,
    });
    ctx.log('info', 'Data model analysis complete', {
      findings: totalFindings,
      schemas: schemas.length,
    });
  },
};
