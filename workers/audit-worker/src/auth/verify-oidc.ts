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
 * Resolve middleware from env: skips verification when NODE_ENV !== 'production'
 * (or when both required env vars are absent — local dev / emulator).
 */
export function oidcMiddlewareFromEnv(): (req: Request, res: Response, next: NextFunction) => void {
  const isProd = process.env.NODE_ENV === 'production';
  const audience = process.env.AUDIT_WORKER_URL ?? '';
  const invokerEmail = process.env.AUDIT_WORKER_INVOKER_SA ?? '';

  if (!isProd) {
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
