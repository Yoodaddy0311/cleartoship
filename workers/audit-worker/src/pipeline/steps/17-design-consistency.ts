// CHECK_DESIGN_CONSISTENCY — inspects Tailwind/CSS token usage across the
// cloned working tree and pushes design-consistency findings into
// state.pendingFindings. Skipped when neither Tailwind nor React is in the
// detected tech stack (analysis would be noise for non-component projects).

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import { analyzeDesignConsistency } from '@cleartoship/audit-core';
import type { Step } from './index.js';
import { writeToolResult } from '../../firestore/writers.js';

const MAX_FILE_BYTES = 512 * 1024; // 512 KB per file

export const step17DesignConsistency: Step = {
  step: 'CHECK_DESIGN_CONSISTENCY',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Design consistency skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'design-consistency',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const stack = state.techStack;
    const eligible = stack.includes('Tailwind CSS') || stack.includes('React');
    if (!eligible) {
      ctx.log('info', 'Design consistency skipped — no Tailwind/React in stack', {
        techStack: stack,
      });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'design-consistency',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'tech stack mismatch', techStack: stack },
        artifactPath: null,
      });
      return;
    }

    const clonePath = ctx.clonePath;
    const readFile = async (relPath: string): Promise<string | null> => {
      const full = path.join(clonePath, relPath);
      try {
        const stat = await fsp.stat(full);
        if (stat.size > MAX_FILE_BYTES) return null;
        return await fsp.readFile(full, 'utf8');
      } catch {
        return null;
      }
    };

    try {
      const { report, findings } = await analyzeDesignConsistency({
        projectRoot: clonePath,
        fileTree: state.fileTree,
        readFile,
      });

      state.pendingFindings.push(...findings);

      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'design-consistency',
        toolVersion: '1.0.0',
        status: 'SUCCESS',
        rawSummary: {
          findings: findings.length,
          score: report.score,
          colorsUsed: report.tokens.colors.used,
          arbitraryColors: report.tokens.colors.arbitrary,
          offScaleSpacing: report.tokens.spacing.offScale.length,
          duplications: report.duplications.length,
        },
        artifactPath: null,
      });

      ctx.log('info', 'Design consistency check complete', {
        findings: findings.length,
        score: report.score,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.log('warn', 'Design consistency check failed', { error: message });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'design-consistency',
        toolVersion: '1.0.0',
        status: 'FAILED',
        rawSummary: { error: message },
        artifactPath: null,
      });
    }
  },
};
