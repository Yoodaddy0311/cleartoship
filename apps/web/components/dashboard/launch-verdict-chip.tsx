import { Card, CardBody } from '@cleartoship/ui';
import {
  LAUNCH_VERDICT_LABELS_KO,
  LAUNCH_VERDICT_TONE,
  type LaunchAnswer,
  type LaunchGateResult,
} from '@cleartoship/shared-types';

// Audit Quality Roadmap §4.1 — 7-Question Launch Gate UI.
//
// Surfaces the deterministic launch verdict directly below the score so a
// non-developer founder gets a crisp "출시해도 되나?" answer plus the seven
// supporting yes/no/unknown checks. The verdict tone + emoji come from
// shared-types (`LAUNCH_VERDICT_TONE`) so the worker and the web app share a
// single source of truth; this component only maps tone → design token and
// renders the breakdown.

interface LaunchVerdictChipProps {
  launchGate: LaunchGateResult;
}

type VerdictTone = (typeof LAUNCH_VERDICT_TONE)[keyof typeof LAUNCH_VERDICT_TONE]['tone'];

// Map the 4 abstract tones onto the existing (AA-validated) severity palette
// already in globals.css — no new colour tokens. `blocked` uses the neutral
// foreground so ⛔ reads as a hard stop rather than another shade of red.
const TONE_TOKEN: Record<VerdictTone, string> = {
  success: 'var(--sev-p3)', // #10B981 green
  warning: 'var(--sev-p1)', // #F97316 orange
  danger: 'var(--sev-p0)', // #E11D48 red
  blocked: 'var(--color-fg-primary)', // neutral dark
};

// Per-answer presentation. The glyph + sr-only text carry the meaning so the
// status never relies on colour alone (WCAG 1.4.1). `srLabel` is Korean for
// the non-developer audience.
const ANSWER_PRESENTATION: Record<
  LaunchAnswer,
  { glyph: string; srLabel: string; token: string }
> = {
  YES: { glyph: '✓', srLabel: '충족', token: 'var(--sev-p3)' },
  NO: { glyph: '✗', srLabel: '미충족', token: 'var(--sev-p0)' },
  UNKNOWN: { glyph: '?', srLabel: '미확인', token: 'var(--color-fg-muted)' },
};

export function LaunchVerdictChip({ launchGate }: LaunchVerdictChipProps) {
  const { verdict, rationale, questions } = launchGate;
  const tone = LAUNCH_VERDICT_TONE[verdict];
  const color = TONE_TOKEN[tone.tone];
  const label = LAUNCH_VERDICT_LABELS_KO[verdict];

  return (
    <Card variant="default" padding="lg">
      <CardBody>
        <section
          aria-labelledby="launch-verdict-title"
          className="flex flex-col gap-5"
        >
          <div className="flex flex-col gap-3">
            <h2
              id="launch-verdict-title"
              className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]"
            >
              출시 게이트 (7문항)
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <span
                data-testid="launch-verdict-chip"
                role="status"
                className="inline-flex h-8 max-w-full items-center gap-2 rounded-full px-4 text-sm font-medium"
                style={{
                  color,
                  background: `color-mix(in oklch, ${color} 12%, transparent)`,
                  border: `1px solid color-mix(in oklch, ${color} 28%, transparent)`,
                }}
                aria-label={label}
              >
                <span aria-hidden="true">{tone.emoji}</span>
                <span className="truncate">{label}</span>
              </span>
            </div>
            <p className="text-md leading-[1.55] text-[color:var(--color-fg-secondary)]">
              {rationale}
            </p>
          </div>

          <ul className="flex flex-col divide-y divide-[color:var(--color-border-subtle)]">
            {questions.map((q) => {
              const a = ANSWER_PRESENTATION[q.answer];
              return (
                <li
                  key={q.id}
                  data-testid={`launch-question-${q.id}`}
                  className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
                    style={{
                      color: a.token,
                      background: `color-mix(in oklch, ${a.token} 12%, transparent)`,
                    }}
                  >
                    {a.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-md text-[color:var(--color-fg-primary)]">
                      <span className="mr-1.5 font-mono text-xs text-[color:var(--color-fg-muted)]">
                        {q.id}
                      </span>
                      {q.question}
                      <span className="sr-only"> — {a.srLabel}</span>
                    </p>
                    {q.evidence.length > 0 ? (
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {q.evidence.map((e, i) => (
                          <li
                            key={`${q.id}-ev-${i}`}
                            className="text-xs text-[color:var(--color-fg-muted)]"
                          >
                            {e}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </CardBody>
    </Card>
  );
}
