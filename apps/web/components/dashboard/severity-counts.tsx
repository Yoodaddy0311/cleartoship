import { Card, CardBody } from '@cleartoship/ui';
import { SEVERITY_ORDER, type Severity } from '@/lib/format/severity';
import { t } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n';

const TOKENS: Record<Severity, string> = {
  P0: 'var(--color-severity-p0)',
  P1: 'var(--color-severity-p1)',
  P2: 'var(--color-severity-p2)',
  P3: 'var(--color-severity-p3)',
};

export function SeverityCounts({
  counts,
}: {
  counts: Record<Severity, number>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {SEVERITY_ORDER.map((s) => {
        const labelKey = `dashboard.severity.${s.toLowerCase()}` as I18nKey;
        return (
          <Card key={s} variant="default" padding="md">
            <CardBody>
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-mono"
                  style={{ color: TOKENS[s] }}
                >
                  {s}
                </span>
                <span className="text-xs text-[color:var(--color-fg-muted)]">
                  {t(labelKey)}
                </span>
              </div>
              <p
                className="mt-2 font-mono tabular-nums"
                style={{
                  color: 'var(--color-fg-primary)',
                  fontSize: '2rem',
                  fontWeight: 600,
                }}
              >
                {counts[s] ?? 0}
              </p>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}
