// MOCK Sprint 0 — replace in Sprint 1 with Playwright + Lighthouse + axe-core.

import type { Step } from './index.js';
import { writeToolResult } from '../../firestore/writers.js';

export const step09AnalyzeDeployUrl: Step = {
  step: 'ANALYZE_DEPLOY_URL',
  async execute(ctx, state) {
    if (!ctx.deployUrl) {
      ctx.log('info', 'Deploy URL analysis skipped (no URL provided)');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'lighthouse-axe',
        toolVersion: 'mock-0.0.0',
        status: 'SKIPPED',
        rawSummary: { reason: 'no deploy url' },
        artifactPath: null,
      });
      return;
    }

    // MOCK Sprint 0 — fake Lighthouse + axe results.
    state.pendingFindings.push({
      title: '모바일 viewport에서 핵심 CTA가 화면 밖으로 잘림',
      category: 'UX_UI',
      severity: 'P1',
      confidence: 'MEDIUM',
      summary:
        '375px 너비 시뮬레이션에서 "감사 시작" 버튼이 fold 밖에 위치합니다.',
      nonDeveloperExplanation:
        '모바일 화면에서 가장 중요한 버튼이 한 번에 보이지 않아 사용자가 놓칠 수 있습니다.',
      technicalExplanation:
        'Lighthouse(mock) mobile run: CLS=0.18, LCP=4.3s. axe-core: 색상 대비 3건 미달.',
      impact: '모바일 사용자의 핵심 전환율 감소.',
      recommendation:
        'CTA를 sticky bottom bar 또는 hero 직후로 옮기고, 색상 대비를 WCAG AA 기준으로 조정하세요.',
      acceptanceCriteria: [
        'iPhone SE viewport(375x667)에서 CTA가 첫 화면에 보인다.',
        'Lighthouse 모바일 accessibility 점수가 90 이상이다.',
      ],
      tags: ['mock-lighthouse', 'mock-axe', 'mobile'],
      evidences: [
        {
          type: 'LIGHTHOUSE',
          source: 'mock-lighthouse',
          path: null,
          lineStart: null,
          lineEnd: null,
          url: ctx.deployUrl,
          selector: null,
          screenshotPath: null,
          snippet: null,
          maskedValue: null,
          metadata: { lcp: 4300, cls: 0.18, performance: 62 },
        },
        {
          type: 'AXE',
          source: 'mock-axe',
          path: null,
          lineStart: null,
          lineEnd: null,
          url: ctx.deployUrl,
          selector: 'button[data-cta="audit-start"]',
          screenshotPath: null,
          snippet: null,
          maskedValue: null,
          metadata: { contrast: 3.1, threshold: 4.5 },
        },
      ],
    });

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'lighthouse-axe',
      toolVersion: 'mock-0.0.0',
      status: 'SUCCESS',
      rawSummary: { mocked: true, findings: 1 },
      artifactPath: null,
    });
    ctx.log('info', 'Deploy URL analysis (mock) complete');
  },
};
