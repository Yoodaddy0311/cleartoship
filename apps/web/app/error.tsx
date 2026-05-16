'use client';

import { useState } from 'react';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@cleartoship/ui';
import { AlertOctagon, RefreshCw } from 'lucide-react';
import { t } from '@/lib/i18n';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  // NOTE: client-side telemetry hook lives here in Sprint 1+. We intentionally
  // do not log to the console — propagate to Sentry/OTEL once available.

  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6 px-4 py-16 sm:px-6">
      <Card variant="default" padding="lg">
        <CardHeader>
          <div className="flex items-center gap-3">
            <AlertOctagon
              aria-hidden="true"
              className="h-6 w-6"
              style={{ color: 'var(--color-severity-p0)' }}
            />
            <CardTitle>{t('common.error')}</CardTitle>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-md text-[color:var(--color-fg-secondary)]">
            잠시 후 다시 시도하거나, 문제가 계속되면 새 감사를 시작해주세요.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              leadingIcon={<RefreshCw className="h-4 w-4" />}
              onClick={() => reset()}
            >
              {t('common.retry')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowDetails((v) => !v)}
              aria-expanded={showDetails}
            >
              {showDetails ? '기술 정보 숨기기' : '기술 정보 보기'}
            </Button>
          </div>
          {showDetails ? (
            <pre className="mt-4 max-h-60 overflow-auto text-xs">
              {error.message}
              {error.digest ? `\n\nDigest: ${error.digest}` : ''}
            </pre>
          ) : null}
        </CardBody>
      </Card>
    </section>
  );
}
