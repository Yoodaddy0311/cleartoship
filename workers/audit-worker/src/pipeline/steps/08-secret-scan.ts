// Regex-based secret scanner over the cloned working tree.
// Security invariant (PRD §11): the raw secret value is NEVER persisted —
// only the masked form (`***<last4>`) emitted by `maskSecret()`.

import { promises as fsp } from 'node:fs';
import * as path from 'node:path';
import type { Step } from './index.js';
import type { NormalizedFinding } from '../../adapters/index.js';
import { writeToolResult } from '../../firestore/writers.js';
import { scanText, looksBinary, type SecretHit } from '../secret-patterns.js';

const MAX_FILE_BYTES = 1024 * 1024; // 1 MB per-file cap
const MAX_FILES_SCANNED = 5_000;
const MAX_FINDINGS = 100;

const SKIP_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.pdf',
  '.zip',
  '.gz',
  '.tar',
  '.tgz',
  '.mp3',
  '.mp4',
  '.mov',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.lock',
]);

function hitToFinding(hit: SecretHit, relPath: string): NormalizedFinding {
  return {
    title: `잠재적 시크릿 노출: ${hit.patternLabel}`,
    category: 'SECURITY_PRIVACY',
    severity: 'P0',
    confidence: 'HIGH',
    summary: `${relPath}:${hit.line}에서 ${hit.patternLabel} 패턴이 발견되었습니다. 키를 즉시 회수하고 secret manager로 옮기세요.`,
    nonDeveloperExplanation:
      '비밀 키처럼 노출되면 안 되는 정보가 코드에 남아있을 가능성이 있습니다. 즉시 새 키로 교체하고 코드에서 제거해야 합니다.',
    technicalExplanation: `Pattern ${hit.patternId} matched at line ${hit.line} col ${hit.column} of ${relPath}.`,
    impact: '키가 외부에 유출되면 비용 청구, 데이터 탈취, 계정 탈취 등이 발생할 수 있습니다.',
    recommendation:
      '1) 키를 발급 콘솔에서 즉시 revoke 2) git history에서 제거(BFG/filter-repo) 3) 환경변수/Secret Manager로 이전.',
    acceptanceCriteria: [
      '코드/히스토리에서 해당 시크릿이 제거되었다.',
      '신규 키가 환경변수 또는 Secret Manager로만 주입된다.',
      'Secret 스캐너 재실행 시 동일 패턴이 검출되지 않는다.',
    ],
    tags: ['secret-scan', hit.patternId],
    evidences: [
      {
        type: 'SECRET_SCAN',
        source: 'secret-scanner',
        path: relPath,
        lineStart: hit.line,
        lineEnd: hit.line,
        url: null,
        selector: null,
        screenshotPath: null,
        snippet: null,
        // SECURITY: maskedValue is the only place we record what was found.
        maskedValue: hit.maskedValue,
        metadata: { pattern: hit.patternId, column: hit.column },
      },
    ],
  };
}

async function* walk(root: string): AsyncGenerator<string> {
  const stack: string[] = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
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
        yield full;
      }
    }
  }
}

export const step08SecretScan: Step = {
  step: 'RUN_SECRET_SCAN',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Secret scan skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'secret-scanner',
        toolVersion: '1.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const findings: NormalizedFinding[] = [];
    let scanned = 0;
    let skippedBinary = 0;
    let skippedSize = 0;

    for await (const filePath of walk(ctx.clonePath)) {
      if (scanned >= MAX_FILES_SCANNED || findings.length >= MAX_FINDINGS) break;
      const ext = path.extname(filePath).toLowerCase();
      if (SKIP_EXT.has(ext)) continue;

      let stat;
      try {
        stat = await fsp.stat(filePath);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        skippedSize++;
        continue;
      }

      let buf: Buffer;
      try {
        buf = await fsp.readFile(filePath);
      } catch {
        continue;
      }
      if (looksBinary(buf)) {
        skippedBinary++;
        continue;
      }

      scanned++;
      const rel = path.relative(ctx.clonePath, filePath).split(path.sep).join('/');
      const hits = scanText(buf.toString('utf8'));
      for (const hit of hits) {
        findings.push(hitToFinding(hit, rel));
        if (findings.length >= MAX_FINDINGS) break;
      }
    }

    state.pendingFindings.push(...findings);

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'secret-scanner',
      toolVersion: '1.0.0',
      status: 'SUCCESS',
      rawSummary: {
        secrets: findings.length,
        filesScanned: scanned,
        skippedBinary,
        skippedSize,
      },
      artifactPath: null,
    });
    // BUG-1: mark RUN_SECRET_SCAN executed only after a successful walk.
    state.executedSteps.push('RUN_SECRET_SCAN');
    ctx.log('info', 'Secret scan complete', {
      secrets: findings.length,
      scanned,
    });
  },
};
