'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { ArrowRight, FileText, Upload } from 'lucide-react';
import { Button, Input, Textarea, Card, CardBody, cn } from '@cleartoship/ui';
import { t } from '@/lib/i18n';
import { createAuditRun, type AuditRunCreateInput } from '@/lib/api/audit-runs';
import { ApiHttpError } from '@/lib/api/client';
import { useEnsureAnonymousAuth } from '@/lib/firebase/auth-init';

const GITHUB_URL = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/;
const PRD_MAX_CHARS = 50_000;

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
  prdText: z.string().max(PRD_MAX_CHARS).optional().or(z.literal('')),
});

type FieldErrors = Partial<Record<keyof AuditRunCreateInput, string>>;
type PrdMode = 'text' | 'file';

export function UrlInputForm() {
  const router = useRouter();
  // Firestore rules require request.auth != null on AuditRun create — mint an
  // anonymous user on mount so the form submission has a uid to attach.
  const auth = useEnsureAnonymousAuth();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [prdMode, setPrdMode] = useState<PrdMode>('text');
  const [filePrdText, setFilePrdText] = useState<string>('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileError(null);
    const file = e.target.files?.[0];
    if (!file) {
      setFilePrdText('');
      setFileName(null);
      return;
    }
    try {
      const text = await file.text();
      if (text.length > PRD_MAX_CHARS) {
        setFileError(t('home.form.prd.file.tooLarge'));
        setFilePrdText('');
        setFileName(null);
        e.target.value = '';
        return;
      }
      setFilePrdText(text);
      setFileName(file.name);
    } catch {
      setFileError(t('home.form.prd.file.readError'));
      setFilePrdText('');
      setFileName(null);
      e.target.value = '';
    }
  }

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
    const prdText =
      prdMode === 'file'
        ? filePrdText
        : String(fd.get('prdText') ?? '').trim();

    const data = {
      repoUrl: String(fd.get('repoUrl') ?? '').trim(),
      deployUrl: String(fd.get('deployUrl') ?? '').trim(),
      prdText,
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

          <div className="flex flex-col gap-2">
            <span className="text-sm text-[color:var(--color-fg-secondary)]">
              {t('home.form.prd.label')}
            </span>
            <p className="text-xs text-[color:var(--color-fg-muted)]">
              {t('home.form.prd.hint')}
            </p>
            <div
              role="radiogroup"
              aria-label={t('home.form.prd.label')}
              className="mt-1 inline-flex w-full overflow-hidden rounded-[10px] border border-[color:var(--color-border-default)]"
            >
              <PrdModeOption
                value="text"
                current={prdMode}
                onSelect={setPrdMode}
                label={t('home.form.prd.mode.text')}
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
              />
              <PrdModeOption
                value="file"
                current={prdMode}
                onSelect={setPrdMode}
                label={t('home.form.prd.mode.file')}
                icon={<Upload className="h-4 w-4" aria-hidden="true" />}
              />
            </div>

            {prdMode === 'text' ? (
              <Textarea
                id="prdText"
                name="prdText"
                rows={5}
                placeholder={t('home.form.prd.placeholder')}
                error={errors.prdText}
              />
            ) : (
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="prdFile"
                  className="text-xs text-[color:var(--color-fg-muted)]"
                >
                  {t('home.form.prd.file.hint')}
                </label>
                <input
                  id="prdFile"
                  name="prdFile"
                  type="file"
                  accept=".md,.txt,text/markdown,text/plain"
                  onChange={onFileChange}
                  className={cn(
                    'block w-full text-sm text-[color:var(--color-fg-secondary)]',
                    'file:mr-3 file:rounded-[8px] file:border-0 file:px-3 file:py-1.5',
                    'file:bg-[color:var(--color-bg-elevated)] file:text-[color:var(--color-fg-primary)]',
                    'file:cursor-pointer cursor-pointer',
                    'rounded-[10px] border border-[color:var(--color-border-default)]',
                    'bg-[color:var(--color-bg-elevated)] px-3 py-2'
                  )}
                />
                {fileName ? (
                  <p
                    className="text-xs text-[color:var(--color-fg-secondary)]"
                    aria-live="polite"
                  >
                    {t('home.form.prd.file.selected')}: {fileName} (
                    {filePrdText.length.toLocaleString()}자)
                  </p>
                ) : null}
                {fileError ? (
                  <p
                    role="alert"
                    className="text-xs text-[color:var(--color-severity-p0)]"
                  >
                    {fileError}
                  </p>
                ) : null}
              </div>
            )}
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

interface PrdModeOptionProps {
  value: PrdMode;
  current: PrdMode;
  onSelect: (v: PrdMode) => void;
  label: string;
  icon: React.ReactNode;
}

function PrdModeOption({
  value,
  current,
  onSelect,
  label,
  icon,
}: PrdModeOptionProps) {
  const active = current === value;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={() => onSelect(value)}
      className={cn(
        'flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm',
        'transition-[background,color] duration-[var(--duration-base)] ease-[var(--ease-standard)]',
        active
          ? 'bg-[color-mix(in_oklch,var(--mk-accent-2)_18%,transparent)] text-[color:var(--app-fg)] font-medium'
          : 'bg-transparent text-[color:var(--app-fg-muted)] hover:bg-[color:var(--app-chip-bg)]'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
