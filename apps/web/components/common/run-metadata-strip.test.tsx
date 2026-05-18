/// <reference types="@testing-library/jest-dom" />
// W2.C10.1: RunMetadataStrip — verifies the two contract bits that matter
// for users reading a run later: deterministic KST timestamp format and the
// optional version pill. Clipboard interaction is left to manual QA — the
// pattern is shared with CopyPromptButton, which already has dedicated tests.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunMetadataStrip } from './run-metadata-strip';

describe('RunMetadataStrip — W2.C10.1', () => {
  it('renders the timestamp formatted as KST (Asia/Seoul) regardless of host TZ', () => {
    // 2026-05-18T00:00:00Z === 2026-05-18 09:00 KST (UTC+9). The component
    // pins timeZone to Asia/Seoul via Intl, so the rendered string must be
    // exactly "2026-05-18 09:00 KST" no matter where the test host runs.
    const utcMidnight = new Date('2026-05-18T00:00:00Z');
    render(
      <RunMetadataStrip
        run={{
          id: 'abcdef1234567890',
          createdAt: utcMidnight,
        }}
      />
    );

    const time = screen.getByTestId('run-metadata-timestamp');
    expect(time.textContent).toBe('2026-05-18 09:00 KST');
    // <time dateTime="..."> should carry the ISO string for SR/parsing.
    expect(time).toHaveAttribute('dateTime', utcMidnight.toISOString());
  });

  it('shows the version pill only when run.version is provided', () => {
    const baseRun = {
      id: 'abcdef1234567890',
      createdAt: new Date('2026-05-18T00:00:00Z'),
    };

    // Without a version: pill is omitted entirely.
    const { unmount } = render(<RunMetadataStrip run={baseRun} />);
    expect(screen.queryByTestId('run-metadata-version')).toBeNull();
    unmount();

    // With a version: pill is rendered with the "v" prefix.
    render(<RunMetadataStrip run={{ ...baseRun, version: '2026.05.18' }} />);
    const pill = screen.getByTestId('run-metadata-version');
    expect(pill).toBeInTheDocument();
    expect(pill.textContent).toBe('v2026.05.18');
  });

  it('truncates the run id to 8 chars and exposes the full id via aria-label', () => {
    render(
      <RunMetadataStrip
        run={{
          id: 'run_abcdef1234567890ZZZZ',
          createdAt: new Date('2026-05-18T00:00:00Z'),
        }}
      />
    );

    expect(screen.getByText('run_abcd')).toBeInTheDocument();
    // Copy-button aria-label uses the i18n key directly (t() returns the key
    // in case the map is missing it, so we assert presence rather than text).
    const copyButton = screen.getByRole('button');
    expect(copyButton.getAttribute('aria-label')).toBeTruthy();
    // Full id is exposed for screen readers via the short-id span's aria-label.
    expect(
      screen.getByLabelText('Run ID run_abcdef1234567890ZZZZ')
    ).toBeInTheDocument();
  });
});
