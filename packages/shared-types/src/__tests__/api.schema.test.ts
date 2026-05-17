import { describe, it, expect } from 'vitest';
import {
  CreateAuditRunRequestSchema,
  CreateAuditRunResponseSchema,
  ErrorBodySchema,
  makeError,
  AuditTaskPayloadSchema,
  ListFindingsQuerySchema,
} from '../api.js';

describe('CreateAuditRunRequestSchema', () => {
  it('accepts a canonical GitHub repo URL with optional nullable fields', () => {
    const input = {
      repoUrl: 'https://github.com/acme/widget',
      deployUrl: null,
      prdText: null,
    };
    const parsed = CreateAuditRunRequestSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it('rejects non-GitHub URLs with a localized message', () => {
    const result = CreateAuditRunRequestSchema.safeParse({
      repoUrl: 'https://gitlab.com/acme/widget',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(' ');
      expect(messages).toContain('GitHub');
    }
  });

  // W2-A: schema cap is 200KB server safety net. The 50KB user cap is enforced
  // in `apps/web/lib/audit-runs/create-audit-run.ts` via PrdTextTooLargeError →
  // 422 + maxBytes/actualBytes (richer than zod's 400). 50_001 chars therefore
  // passes the schema and is rejected downstream by createAuditRun().
  it('accepts prdText up to 200,000 chars (50KB user cap enforced downstream)', () => {
    const within = 'x'.repeat(50_001);
    const result = CreateAuditRunRequestSchema.safeParse({
      repoUrl: 'https://github.com/a/b',
      prdText: within,
    });
    expect(result.success).toBe(true);
  });

  it('rejects prdText longer than 200,000 chars (server safety net)', () => {
    const huge = 'x'.repeat(200_001);
    const result = CreateAuditRunRequestSchema.safeParse({
      repoUrl: 'https://github.com/a/b',
      prdText: huge,
    });
    expect(result.success).toBe(false);
  });
});

describe('CreateAuditRunResponseSchema', () => {
  it('round-trips a valid response', () => {
    const payload = {
      auditRunId: 'run_123',
      projectId: 'proj_456',
      status: 'PENDING' as const,
    };
    expect(CreateAuditRunResponseSchema.parse(payload)).toEqual(payload);
  });

  it('refuses any status other than PENDING (literal)', () => {
    const bad = {
      auditRunId: 'r',
      projectId: 'p',
      status: 'RUNNING',
    };
    expect(CreateAuditRunResponseSchema.safeParse(bad).success).toBe(false);
  });
});

describe('ErrorBodySchema + makeError helper', () => {
  it('builds a parseable error envelope without details', () => {
    const body = makeError('NOT_FOUND', 'missing');
    const parsed = ErrorBodySchema.parse(body);
    expect(parsed.error.code).toBe('NOT_FOUND');
    expect(parsed.error.message).toBe('missing');
    expect(parsed.error.details).toBeUndefined();
  });

  it('preserves details when provided', () => {
    const body = makeError('INVALID_INPUT', 'bad field', { field: 'repoUrl' });
    const parsed = ErrorBodySchema.parse(body);
    expect(parsed.error.details).toEqual({ field: 'repoUrl' });
  });

  it('rejects unknown error codes', () => {
    const bad = { error: { code: 'TEAPOT', message: 'no' } };
    expect(ErrorBodySchema.safeParse(bad).success).toBe(false);
  });
});

describe('AuditTaskPayloadSchema', () => {
  it('round-trips a complete worker payload', () => {
    const payload = {
      runId: 'r1',
      projectId: 'p1',
      ownerId: 'u1',
      repoUrl: 'https://github.com/a/b',
      deployUrl: 'https://example.com',
      prdText: 'short prd',
      commitHash: 'abc123',
    };
    expect(AuditTaskPayloadSchema.parse(payload)).toEqual(payload);
  });

  it('requires explicit nulls (no undefined) for nullable fields', () => {
    const missingNulls = {
      runId: 'r1',
      projectId: 'p1',
      ownerId: 'u1',
      repoUrl: 'https://github.com/a/b',
    };
    expect(AuditTaskPayloadSchema.safeParse(missingNulls).success).toBe(false);
  });
});

describe('ListFindingsQuerySchema', () => {
  it('coerces numeric limit from string (query param)', () => {
    const parsed = ListFindingsQuerySchema.parse({ limit: '25' });
    expect(parsed.limit).toBe(25);
  });

  it('rejects out-of-range severity', () => {
    expect(
      ListFindingsQuerySchema.safeParse({ severity: 'P5' }).success,
    ).toBe(false);
  });

  it('accepts empty query (all fields optional)', () => {
    const parsed = ListFindingsQuerySchema.parse({});
    expect(parsed).toBeDefined();
  });
});
