// Re-validates the AuditRun's input URLs at the worker boundary.
//
// SECURITY (sec-auditor P1, defense-in-depth):
// The web app (POST /api/audit-runs) already validates repoUrl + deployUrl,
// but the worker runs AFTER a Cloud Tasks queue hop. If the Firestore doc
// were ever mutated between enqueue and execute (admin tampering, future bug,
// retried task with stale state), the worker would otherwise trust whatever
// it read. We re-run the *same* SSRF defense here using the shared validators
// from @cleartoship/audit-core so both sides stay in lock-step.
//
// Rejects (via parseDeployUrl):
//   - non-http(s) schemes (file://, javascript:, ftp://, ws://, etc.)
//   - private IPv4: 10/8, 127/8, 169.254/16 (incl. GCP metadata 169.254.169.254),
//     172.16/12, 192.168/16, 0/8, 100.64/10 CGNAT
//   - private IPv6: ::1, ::, fc00::/7, fe80::/10, IPv4-mapped private addresses
//   - reserved hostnames: localhost, metadata.google.internal, *.local
//
// validateDeployUrl additionally resolves the hostname via DNS and rejects
// if any resolved address is in a reserved range (catches DNS rebinding +
// hostname-only SSRF that parseDeployUrl can't see synchronously).

import { parseGitHubUrl, validateDeployUrl } from '@cleartoship/audit-core';
import type { Step } from './index.js';

export const step01ValidateInput: Step = {
  step: 'VALIDATE_INPUT',
  async execute(ctx) {
    // 1) Repo URL — must be a well-formed https://github.com/owner/repo URL.
    try {
      parseGitHubUrl(ctx.repoUrl);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`잘못된 GitHub Repo URL: ${message}`);
    }

    // 2) Deploy URL — SSRF defense in depth. We always run the full async
    // check (DNS-resolve hostname → reject if any A/AAAA hits a reserved
    // range). This guards against an attacker swapping a public hostname's
    // DNS record to point at internal infra between web validation and
    // worker execution.
    if (ctx.deployUrl) {
      try {
        await validateDeployUrl(ctx.deployUrl);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`잘못된 배포 URL (SSRF 차단): ${message}`);
      }
    }

    ctx.log('info', 'Input validated', {
      repoUrl: ctx.repoUrl,
      deployUrl: ctx.deployUrl ?? null,
    });
  },
};
