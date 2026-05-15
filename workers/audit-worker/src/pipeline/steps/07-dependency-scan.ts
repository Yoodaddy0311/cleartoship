// MOCK Sprint 0 — replace in Sprint 1 with `osv-scanner --format json` adapter.

import type { Step } from './index.js';
import { writeToolResult } from '../../firestore/writers.js';

export const step07DependencyScan: Step = {
  step: 'RUN_DEPENDENCY_SCAN',
  async execute(ctx, state) {
    // MOCK Sprint 0 — emit 1 OSV-like finding.
    state.pendingFindings.push({
      title: 'next 14.2.0 — 알려진 보안 취약점 (mock)',
      category: 'SECURITY_PRIVACY',
      severity: 'P1',
      confidence: 'HIGH',
      summary:
        '의존성 next@14.2.0에는 CVE-MOCK-2026-0001 (Cache Poisoning) 취약점이 있습니다. 14.2.4 이상으로 업그레이드하세요.',
      nonDeveloperExplanation:
        '사용 중인 라이브러리에 알려진 보안 약점이 있습니다. 최신 버전으로 업데이트하면 자동으로 해결됩니다.',
      technicalExplanation:
        'OSV.dev 매칭: GHSA-mock-xxxx-xxxx-xxxx, severity 7.5 / introduced=14.2.0 / fixed=14.2.4.',
      impact: 'SSR 응답 캐시가 오염되어 다른 사용자에게 오류 페이지가 노출될 수 있습니다.',
      recommendation: 'package.json의 next 버전을 ^14.2.4 이상으로 올리고 lockfile을 재생성하세요.',
      acceptanceCriteria: [
        'package.json의 next 버전이 14.2.4 이상이다.',
        'pnpm-lock.yaml 재생성 후 OSV 스캔에서 동일 경고가 사라진다.',
      ],
      tags: ['mock-osv', 'dependency'],
      evidences: [
        {
          type: 'OSV',
          source: 'mock-osv-scanner',
          path: 'package.json',
          lineStart: null,
          lineEnd: null,
          url: 'https://osv.dev/vulnerability/GHSA-mock-xxxx-xxxx-xxxx',
          selector: null,
          screenshotPath: null,
          snippet: '"next": "14.2.0"',
          maskedValue: null,
          metadata: { cve: 'CVE-MOCK-2026-0001', cvss: 7.5 },
        },
      ],
    });

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'osv-scanner',
      toolVersion: 'mock-0.0.0',
      status: 'SUCCESS',
      rawSummary: { mocked: true, vulns: 1 },
      artifactPath: null,
    });
    ctx.log('info', 'Dependency scan (mock) complete', { vulns: 1 });
  },
};
