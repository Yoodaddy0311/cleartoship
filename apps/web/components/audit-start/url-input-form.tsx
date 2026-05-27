'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { z } from 'zod';
import { ArrowRight } from 'lucide-react';
import { Button, Input, Card, CardBody, cn } from '@cleartoship/ui';
import { t } from '@/lib/i18n';
import { createAuditRun, type AuditRunCreateInput } from '@/lib/api/audit-runs';
import { ApiHttpError } from '@/lib/api/client';
import { useEnsureAnonymousAuth } from '@/lib/firebase/auth-init';
import { PrdInput } from './prd-input';

const GITHUB_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/;
// W2-A AC2: 50 KB byte cap (UTF-8). Char-based caps would let 16_667 한글
// pass at ~50 KB while letting 50 000 한글 (~150 KB) blow past the server
// limit. PrdInput shows the visual warning; this is the submit-time gate.
const PRD_MAX_BYTES = 50_000;
const prdEncoder =
  typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
function prdByteLength(value: string): number {
  if (prdEncoder) return prdEncoder.encode(value).length;
  return Buffer.byteLength(value, 'utf8');
}

// T2.4: client-side allowlist of selectable audit-profile ids. Mirrors the
// `AUDIT_PROFILES` registry in `@cleartoship/audit-core` but kept local so the
// `<select>` dropdown can render without pulling the audit-core bundle into
// the marketing page. Unknown ids submitted via tampered DOM are filtered out
// before hitting the API.
const PROFILE_IDS = ['landing', 'saas', 'ecommerce'] as const;
type ProfileOptionId = (typeof PROFILE_IDS)[number];
function isProfileId(v: string): v is ProfileOptionId {
  return (PROFILE_IDS as ReadonlyArray<string>).includes(v);
}

const schema = z.object({
  repoUrl: z
    .string({ required_error: t('home.form.error.repoUrl') })
    .min(1, t('home.form.error.repoUrl'))
    .regex(GITHUB_URL, t('home.form.error.repoUrl')),
  deployUrl: z
    .string()
    .url(t('home.form.error.deployUrl'))
    .optional()
    .or(z.literal('')),
  prdText: z
    .string()
    .refine((v) => prdByteLength(v) <= PRD_MAX_BYTES, {
      message: t('audit.prd.tooLarge'),
    })
    .optional()
    .or(z.literal('')),
});

type FieldErrors = Partial<Record<keyof AuditRunCreateInput, string>>;

export function UrlInputForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // T2.9 #121: `/samples` cards send users here with `?repo=<github-url>`;
  // only accept the value if it matches the GitHub URL regex so a tampered
  // querystring cannot pre-poison validation or render unsafe text.
  const repoParam = searchParams?.get('repo') ?? '';
  const initialRepoUrl = GITHUB_URL.test(repoParam) ? repoParam : '';
  // Firestore rules require request.auth != null on AuditRun create — mint an
  // anonymous user on mount so the form submission has a uid to attach.
  const auth = useEnsureAnonymousAuth();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  // W2-A: PrdInput owns its own file-read + counter UI; the form only holds
  // the canonical text value and forwards it to the create payload.
  const [prdText, setPrdText] = useState<string>('');
  // §6.6: opt-in "AI 보조 분석" flag. Default UNCHECKED — the audit stays fully
  // deterministic unless the user explicitly turns this on.
  const [aiEnhanced, setAiEnhanced] = useState<boolean>(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    setErrors({});

    // Gate submit on the anonymous auth bootstrap — without a uid the
    // server-side AuditRun create would be rejected by firestore.rules.
    if (auth.initializing || auth.error || !auth.uid) {
      setSubmitError(
        auth.error ? t('home.form.auth.error') : t('home.form.auth.initializing')
      );
      return;
    }

    const fd = new FormData(e.currentTarget);
    // W2-A: PrdInput is a controlled component; read from state, not FormData.
    // .trim() || null normalises blank/whitespace to null so the server never
    // sees empty PRD strings (false-positive guard in step04c).
    const trimmedPrd = prdText.trim();

    const rawProfile = String(fd.get('profileId') ?? '').trim();
    const profileId = isProfileId(rawProfile) ? rawProfile : '';

    const data = {
      repoUrl: String(fd.get('repoUrl') ?? '').trim(),
      deployUrl: String(fd.get('deployUrl') ?? '').trim(),
      prdText: trimmedPrd,
    };

    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const fieldErr: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof AuditRunCreateInput;
        if (!fieldErr[k]) fieldErr[k] = issue.message;
      }
      setErrors(fieldErr);
      return;
    }

    startTransition(async () => {
      try {
        const payload: AuditRunCreateInput = {
          repoUrl: parsed.data.repoUrl,
          ...(parsed.data.deployUrl ? { deployUrl: parsed.data.deployUrl } : {}),
          ...(parsed.data.prdText ? { prdText: parsed.data.prdText } : {}),
          ...(profileId ? { profileId } : {}),
          // §6.6: only carry the flag when opted in (mirror profileId above) so
          // the default request body is byte-for-byte identical to today's.
          ...(aiEnhanced ? { aiEnhanced: true } : {}),
        };
        const response = await createAuditRun(payload);
        router.push(`/audits/${encodeURIComponent(response.auditRunId)}`);
      } catch (err) {
        const message =
          err instanceof ApiHttpError && err.message
            ? err.message
            : t('home.form.error.generic');
        setSubmitError(message);
      }
    });
  }

  return (
    <Card variant="default" padding="lg" className="w-full max-w-[640px]">
      <CardBody>
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
          <Input
            id="repoUrl"
            name="repoUrl"
            type="url"
            inputMode="url"
            required
            autoComplete="off"
            spellCheck={false}
            label={t('home.form.repoUrl.label')}
            placeholder={t('home.form.repoUrl.placeholder')}
            hint={t('home.form.repoUrl.hint')}
            error={errors.repoUrl}
            defaultValue={initialRepoUrl}
          />
          <Input
            id="deployUrl"
            name="deployUrl"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            label={t('home.form.deployUrl.label')}
            placeholder={t('home.form.deployUrl.placeholder')}
            hint={t('home.form.deployUrl.hint')}
            error={errors.deployUrl}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="profileId"
              className="text-sm text-[color:var(--color-fg-secondary)]"
            >
              {t('home.form.profile.label')}
            </label>
            <p className="text-xs text-[color:var(--color-fg-muted)]">
              {t('home.form.profile.hint')}
            </p>
            <select
              id="profileId"
              name="profileId"
              defaultValue=""
              className={cn(
                'block w-full rounded-[10px] border border-[color:var(--color-border-default)]',
                'bg-[color:var(--color-bg-elevated)] px-3 py-2 text-sm',
                'text-[color:var(--color-fg-primary)]',
              )}
            >
              <option value="">{t('home.form.profile.option.none')}</option>
              <option value="landing">{t('home.form.profile.option.landing')}</option>
              <option value="saas">{t('home.form.profile.option.saas')}</option>
              <option value="ecommerce">{t('home.form.profile.option.ecommerce')}</option>
            </select>
          </div>

          <PrdInput
            value={prdText}
            onChange={setPrdText}
            disabled={pending || auth.initializing}
          />

          {/* §6.6: opt-in "AI 보조 분석" checkbox. Default unchecked. Real
              <label htmlFor> association + aria-describedby links the helper
              line for screen readers; the native checkbox is keyboard operable
              (Space toggles) with a visible focus ring for WCAG AA. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-start gap-2.5">
              <input
                id="aiEnhanced"
                name="aiEnhanced"
                type="checkbox"
                checked={aiEnhanced}
                onChange={(e) => setAiEnhanced(e.currentTarget.checked)}
                disabled={pending || auth.initializing}
                aria-describedby="aiEnhanced-hint"
                className={cn(
                  'mt-0.5 h-4 w-4 shrink-0 rounded-[4px]',
                  'border border-[color:var(--color-border-default)]',
                  'bg-[color:var(--color-bg-elevated)]',
                  'accent-[color:var(--mk-accent-2)]',
                  'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              />
              <label
                htmlFor="aiEnhanced"
                className="text-sm text-[color:var(--color-fg-secondary)]"
              >
                {t('home.form.aiEnhanced.label')}
              </label>
            </div>
            <p
              id="aiEnhanced-hint"
              className="text-xs text-[color:var(--color-fg-muted)]"
            >
              {t('home.form.aiEnhanced.hint')}
            </p>
          </div>

          {auth.error ? (
            <p
              role="alert"
              className="text-sm text-[color:var(--color-severity-p0)]"
            >
              {t('home.form.auth.error')}
            </p>
          ) : null}
          {submitError ? (
            <p
              role="alert"
              className="text-sm text-[color:var(--color-severity-p0)]"
            >
              {submitError}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={pending || auth.initializing}
            disabled={auth.initializing || !!auth.error}
            trailingIcon={<ArrowRight className="h-4 w-4" />}
            fullWidth
          >
            {auth.initializing
              ? t('home.form.auth.initializing')
              : pending
              ? t('home.form.submitting')
              : t('home.form.submit')}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

