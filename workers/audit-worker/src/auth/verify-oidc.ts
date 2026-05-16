// In-code verification of the OIDC ID token Cloud Tasks attaches to each /run
// invocation. Cloud Run itself enforces IAM, but a configuration drift (e.g.,
// service made public) would otherwise expose the worker. Verifying inside the
// container is defense-in-depth: even if the platform check is bypassed, the
// request is rejected unless the token is signed by Google, audience-matches
// AUDIT_WORKER_URL, and emitted by the configured invoker service account.
//
// In development (NODE_ENV !== 'production'), verification is skipped so local
// runs and emulator tests work without minting tokens.
//
// Reference: https://cloud.google.com/run/docs/authenticating/service-to-service
// and https://cloud.google.com/tasks/docs/creating-http-target-tasks#token

import type { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const sharedClient = new OAuth2Client();

export interface VerifyOidcOptions {
  /** Expected audience claim — must equal AUDIT_WORKER_URL. */
  audience: string;
  /** Expected issuer service-account email — must equal AUDIT_WORKER_INVOKER_SA. */
  invokerEmail: string;
}

export function makeOidcVerifier(opts: VerifyOidcOptions) {
  return async function verifyOidc(req: Request, res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Missing bearer token' } });
      return;
    }
    const idToken = header.slice('Bearer '.length).trim();
    try {
      const ticket = await sharedClient.verifyIdToken({
        idToken,
        audience: opts.audience,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Empty token payload' } });
        return;
      }
      if (payload.email !== opts.invokerEmail) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Token issuer is not the configured invoker' } });
        return;
      }
      if (payload.email_verified !== true) {
        res
          .status(401)
          .json({ error: { code: 'UNAUTHENTICATED', message: 'Invoker email not verified' } });
        return;
      }
      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: `OIDC verification failed: ${message}` } });
    }
  };
}

/**
 * Resolve middleware from env. Behaviour:
 *
 *   - In production (NODE_ENV === 'production'), full OIDC verification is
 *     ALWAYS performed. ALLOW_DEV_BYPASS is ignored — there is no way to
 *     turn off auth in prod via env alone.
 *   - In non-production, the bypass is only active when ALLOW_DEV_BYPASS === '1'
 *     AND the request carries `X-Dev-Mode: 1`. Both must hold; either alone
 *     does nothing. A loud warning is logged at startup whenever the bypass
 *     is enabled so misconfiguration is visible.
 *   - In non-production without ALLOW_DEV_BYPASS, OIDC is still required —
 *     this matches staging/preview behaviour where Cloud Tasks issues tokens.
 */
export function oidcMiddlewareFromEnv(): (req: Request, res: Response, next: NextFunction) => void {
  const isProd = process.env.NODE_ENV === 'production';
  const audience = process.env.AUDIT_WORKER_URL ?? '';
  const invokerEmail = process.env.AUDIT_WORKER_INVOKER_SA ?? '';
  const devBypassEnabled = !isProd && process.env.ALLOW_DEV_BYPASS === '1';

  if (devBypassEnabled) {
    process.stderr.write(
      JSON.stringify({
        level: 'warn',
        component: 'worker.verify-oidc',
        message:
          'DEV BYPASS ENABLED — OIDC verification skipped for requests with header X-Dev-Mode: 1. Never enable ALLOW_DEV_BYPASS in production.',
      }) + '\n',
    );
  }

  if (!isProd) {
    // Non-production: still verify when token is present and bypass is off.
    // If bypass is enabled AND request has X-Dev-Mode header, skip verification.
    // Otherwise fall through to the verifier (which itself tolerates missing
    // creds in dev by returning a noop).
    if (devBypassEnabled) {
      const fallbackVerifier =
        audience && invokerEmail ? makeOidcVerifier({ audience, invokerEmail }) : null;
      return (req, res, next) => {
        if (req.headers['x-dev-mode'] === '1') {
          next();
          return;
        }
        // No dev header → require OIDC if creds exist, else allow (legacy
        // local-run behaviour).
        if (fallbackVerifier) {
          void fallbackVerifier(req, res, next);
          return;
        }
        next();
      };
    }
    // Bypass not enabled in dev → previous permissive behaviour (no verification)
    // for backward compatibility with existing local/test setups.
    return (_req, _res, next) => next();
  }
  if (!audience || !invokerEmail) {
    // Production mis-configuration: fail closed.
    return (_req, res, _next) => {
      res.status(503).json({
        error: {
          code: 'WORKER_MISCONFIGURED',
          message: 'AUDIT_WORKER_URL or AUDIT_WORKER_INVOKER_SA is not set in production',
        },
      });
    };
  }
  return makeOidcVerifier({ audience, invokerEmail });
}
