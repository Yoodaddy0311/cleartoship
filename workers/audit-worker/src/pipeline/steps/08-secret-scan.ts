// MOCK Sprint 0 — replace in Sprint 1 with /opt/secret-scanner/index.js adapter.

import type { Step } from './index.js';
import { writeToolResult } from '../../firestore/writers.js';

export const step08SecretScan: Step = {
  step: 'RUN_SECRET_SCAN',
  async execute(ctx, state) {
    // MOCK Sprint 0 — emit 1 masked secret finding.
    state.pendingFindings.push({
      title: '.env 파일에 OpenAI API Key로 추정되는 값이 노출됨 (mock)',
      category: 'SECURITY_PRIVACY',
      severity: 'P0',
      confidence: 'HIGH',
      summary:
        'Repo 루트의 .env 파일에 sk-************************로 시작하는 OpenAI 키 패턴이 발견되었습니다. 키를 즉시 회수하고 secret manager로 옮기세요.',
      nonDeveloperExplanation:
        '비밀번호나 API 키 같은 비밀 정보가 GitHub 코드에 그대로 남아있습니다. 다른 사람이 이 키를 사용해 요금을 발생시키거나 데이터를 가져갈 수 있어 즉시 교체해야 합니다.',
      technicalExplanation:
        'Regex 매칭: /sk-[A-Za-z0-9]{32,}/ on .env. Hash sha256:mock_hash.',
      impact: '키를 사용한 비용 폭주 / 데이터 유출 가능.',
      recommendation:
        '1) 키를 즉시 OpenAI 콘솔에서 revoke, 2) .env를 .gitignore에 추가, 3) Cloud Secret Manager 또는 환경변수로 이동.',
      acceptanceCriteria: [
        '.env가 git history에서 BFG 또는 git filter-repo로 제거되었다.',
        '신규 키가 환경변수 또는 Secret Manager로만 주입된다.',
        'Secret 스캐너 재실행 시 동일 패턴이 발견되지 않는다.',
      ],
      tags: ['mock-secret-scan', 'secret'],
      evidences: [
        {
          type: 'SECRET_SCAN',
          source: 'mock-secret-scanner',
          path: '.env',
          lineStart: 1,
          lineEnd: 1,
          url: null,
          selector: null,
          screenshotPath: null,
          snippet: null,
          maskedValue: 'sk-****************************XXXX',
          metadata: { pattern: 'openai-api-key' },
        },
      ],
    });

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'secret-scanner',
      toolVersion: 'mock-0.0.0',
      status: 'SUCCESS',
      rawSummary: { mocked: true, secrets: 1 },
      artifactPath: null,
    });
    ctx.log('info', 'Secret scan (mock) complete', { secrets: 1 });
  },
};
