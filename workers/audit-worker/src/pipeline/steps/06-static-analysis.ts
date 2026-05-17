// Semgrep CE static analysis. Invokes `semgrep --config=auto --json` against
// the cloned working tree. Gracefully skips when the binary is not present.

import type { Step } from './index.js';
import type { NormalizedFinding } from '../../adapters/index.js';
import { writeToolResult } from '../../firestore/writers.js';
import { spawnTool } from '../tool-runner.js';

interface SemgrepResult {
  results?: Array<{
    check_id?: string;
    path?: string;
    start?: { line?: number };
    end?: { line?: number };
    extra?: {
      message?: string;
      severity?: string;
      lines?: string;
      metadata?: Record<string, unknown>;
    };
  }>;
  errors?: unknown[];
}

const SEV_MAP: Record<string, 'P0' | 'P1' | 'P2' | 'P3'> = {
  ERROR: 'P0',
  WARNING: 'P1',
  INFO: 'P2',
};

// Maps semgrep rule-id family → friendly Korean explanation aimed at vibe
// coders. Match is performed case-insensitively against substrings of the
// rule id, so e.g. `javascript.lang.security.audit.xss.react-href` falls into
// the `xss` bucket. Severity adds a one-liner urgency hint on top.
const RULE_FAMILY_EXPLANATIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/sql[-_.]?inject|sqli/i, 'SQL 인젝션 위험: 사용자가 입력한 값이 데이터베이스 쿼리에 그대로 섞여 들어가고 있어요. 공격자가 데이터를 훔치거나 지울 수 있습니다. 파라미터 바인딩(예: prepared statement)으로 바꿔야 합니다.'],
  [/xss|cross[-_.]?site/i, '크로스사이트 스크립팅(XSS) 위험: 사용자가 입력한 텍스트가 화면에 그대로 출력되어 악성 스크립트가 실행될 수 있어요. 출력 전에 이스케이프하거나 React라면 `dangerouslySetInnerHTML`을 피하세요.'],
  [/path[-_.]?travers|directory[-_.]?travers/i, '경로 우회 위험: 사용자 입력으로 파일 경로를 만들고 있어 `../` 같은 패턴으로 의도하지 않은 파일에 접근할 수 있어요. 화이트리스트 검증을 추가하세요.'],
  [/command[-_.]?inject|os[-_.]?command|shell/i, '명령어 인젝션 위험: 사용자 입력이 쉘 명령어에 섞여 실행될 수 있어요. 가능한 한 `spawn` 같은 인자 배열 방식을 쓰고, 입력을 검증하세요.'],
  [/ssrf/i, 'SSRF 위험: 외부 URL을 사용자가 지정할 수 있어 내부망(예: 메타데이터 서버)에 요청이 갈 수 있어요. 도메인 화이트리스트가 필요합니다.'],
  [/hardcoded|secret|api[-_.]?key|password/i, '비밀값 노출 의심: 코드에 키/비밀번호가 박혀 있는 패턴이 보입니다. 환경변수나 secret manager로 옮기세요.'],
  [/regex[-_.]?dos|redos/i, '정규식 DoS 위험: 백트래킹이 폭주할 수 있는 패턴이라 큰 입력에서 서버가 멈출 수 있어요. 정규식을 단순화하거나 입력 길이를 제한하세요.'],
  [/insecure[-_.]?random|weak[-_.]?random|math[-_.]?random/i, '안전하지 않은 난수: 보안용으로 `Math.random()` 같은 약한 난수를 쓰고 있어요. 토큰/세션 ID 등엔 `crypto.randomBytes` 같은 암호학적 난수를 쓰세요.'],
  [/insecure[-_.]?hash|md5|sha1/i, '약한 해시 알고리즘: MD5/SHA1은 충돌이 발견되어 보안 용도로는 부적합합니다. 비밀번호는 bcrypt/argon2, 무결성은 SHA-256 이상을 쓰세요.'],
  [/jwt|jsonwebtoken/i, 'JWT 사용 주의: 토큰 알고리즘이 약하거나 검증이 누락된 패턴이 보입니다. 알고리즘을 명시(`RS256` 등)하고 만료/issuer를 검증하세요.'],
  [/cors/i, 'CORS 설정 주의: `Access-Control-Allow-Origin: *` 같이 모든 출처를 허용하면 인증 정보가 외부에서 사용될 수 있어요. 출처를 좁히세요.'],
  [/csrf/i, 'CSRF 위험: 상태 변경 요청에 토큰 검증이 빠진 패턴이에요. SameSite 쿠키나 CSRF 토큰을 추가하세요.'],
  [/open[-_.]?redirect/i, '열린 리디렉트: 사용자 입력을 그대로 리디렉트 URL로 쓰면 피싱에 악용될 수 있어요. 화이트리스트로 검증하세요.'],
  [/eval|new[-_.]?function/i, '동적 코드 실행 위험: `eval`/`new Function`은 입력이 그대로 실행돼 매우 위험해요. 대체 방법을 찾으세요.'],
  [/prototype[-_.]?pollut/i, '프로토타입 오염 위험: 입력이 `__proto__` 같은 키를 통해 객체의 기본 동작을 바꿀 수 있어요. 라이브러리 업데이트 또는 입력 검증이 필요합니다.'],
  [/insecure[-_.]?cookie|cookie[-_.]?http(only|s)/i, '쿠키 보안 옵션 누락: `httpOnly`/`secure`/`sameSite` 옵션이 빠져 있어요. 세션 쿠키엔 모두 켜는 게 안전합니다.'],
  [/null[-_.]?check|undefined/i, 'null/undefined 처리 누락: 값이 없을 때 앱이 터질 수 있어요. 조건 분기를 추가하세요.'],
  [/unused/i, '쓰이지 않는 코드: 지금 당장 버그는 아니지만 정리하면 코드가 더 깔끔해집니다.'],
  [/security[-_.]?audit|audit/i, '보안 점검 항목: 도구가 일반적인 보안 베스트프랙티스 위반을 감지했습니다. 이 라인을 검토해주세요.'],
];

function explainSemgrepRule(ruleId: string, severity: 'P0' | 'P1' | 'P2' | 'P3'): string {
  // Pick the first family that matches. Most rule IDs are descriptive enough
  // that the first hit is the right one; the order above is roughly
  // most-severe-first to break ties.
  for (const [re, msg] of RULE_FAMILY_EXPLANATIONS) {
    if (re.test(ruleId)) {
      const urgency = severity === 'P0'
        ? '⚠️ 가능한 한 빨리 고쳐주세요.'
        : severity === 'P1'
          ? '🔧 출시 전에 확인하면 좋아요.'
          : '💡 시간 될 때 점검해두세요.';
      return `${msg} ${urgency}`;
    }
  }
  return '코드 검사 도구가 잠재적 보안/품질 문제를 발견했습니다. 어떤 코드인지는 아래 “기술 설명”을 참고하고, 해당 라인을 검토해주세요.';
}

function mapResults(raw: SemgrepResult): NormalizedFinding[] {
  if (!raw.results || raw.results.length === 0) return [];
  return raw.results.slice(0, 200).map((r) => {
    const ruleId = r.check_id ?? 'semgrep-unknown';
    const sevKey = (r.extra?.severity ?? 'INFO').toUpperCase();
    const severity = SEV_MAP[sevKey] ?? 'P2';
    const message = r.extra?.message ?? ruleId;
    return {
      title: `Semgrep: ${ruleId}`,
      category: 'SECURITY_PRIVACY',
      severity,
      confidence: 'MEDIUM',
      summary: message,
      nonDeveloperExplanation: explainSemgrepRule(ruleId, severity),
      technicalExplanation: `Semgrep rule ${ruleId} matched ${r.path}:${r.start?.line ?? '?'}.`,
      impact: '취약점 유형에 따라 보안/품질 영향이 달라질 수 있습니다.',
      recommendation: '해당 라인을 검토하고 규칙 가이드라인에 따라 수정하세요.',
      acceptanceCriteria: ['해당 패턴이 재발하지 않도록 코드가 수정되었다.'],
      tags: ['semgrep', sevKey.toLowerCase()],
      evidences: [
        {
          type: 'SEMGREP',
          source: 'semgrep',
          path: r.path ?? null,
          lineStart: r.start?.line ?? null,
          lineEnd: r.end?.line ?? null,
          url: null,
          selector: null,
          screenshotPath: null,
          snippet: r.extra?.lines ?? null,
          maskedValue: null,
          metadata: { rule: ruleId, ...(r.extra?.metadata ?? {}) },
        },
      ],
    };
  });
}

export const step06StaticAnalysis: Step = {
  step: 'RUN_STATIC_ANALYSIS',
  async execute(ctx, state) {
    if (!ctx.clonePath) {
      ctx.log('warn', 'Semgrep skipped — no clone path');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'semgrep',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'no clone path' },
        artifactPath: null,
      });
      return;
    }

    const result = await spawnTool(
      'semgrep',
      ['--config=auto', '--json', '--quiet', '--timeout=60', '--metrics=off', ctx.clonePath],
      { timeoutMs: 180_000 },
    );

    if (result.notInstalled) {
      ctx.log('warn', 'Semgrep not installed; skipping');
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'semgrep',
        toolVersion: 'n/a',
        status: 'SKIPPED',
        rawSummary: { reason: 'semgrep binary not found on PATH' },
        artifactPath: null,
      });
      return;
    }

    // Semgrep exits 1 when findings exist — treat 0 and 1 as success.
    const ok = result.exitCode === 0 || result.exitCode === 1;
    if (!ok) {
      ctx.log('warn', 'Semgrep exited non-success', {
        exitCode: result.exitCode,
        stderr: result.stderr.slice(0, 500),
      });
      await writeToolResult({
        auditRunId: ctx.runId,
        toolName: 'semgrep',
        toolVersion: 'unknown',
        status: 'FAILED',
        rawSummary: { exitCode: result.exitCode, stderr: result.stderr.slice(0, 2000) },
        artifactPath: null,
      });
      return;
    }

    let parsed: SemgrepResult = {};
    try {
      parsed = JSON.parse(result.stdout) as SemgrepResult;
    } catch (e) {
      ctx.log('warn', 'Semgrep JSON parse failed', { error: (e as Error).message });
    }

    const findings = mapResults(parsed);
    state.pendingFindings.push(...findings);

    await writeToolResult({
      auditRunId: ctx.runId,
      toolName: 'semgrep',
      toolVersion: 'unknown',
      status: 'SUCCESS',
      rawSummary: {
        findings: findings.length,
        rawCount: parsed.results?.length ?? 0,
        durationMs: result.durationMs,
      },
      artifactPath: null,
    });
    // BUG-1: only mark RUN_STATIC_ANALYSIS as executed on the SUCCESS path.
    // The skip/fail branches above already returned without pushing.
    state.executedSteps.push('RUN_STATIC_ANALYSIS');
    ctx.log('info', 'Static analysis complete', { findings: findings.length });
  },
};
