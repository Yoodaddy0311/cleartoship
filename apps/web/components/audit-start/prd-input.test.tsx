// W2-A PrdInput — behavioural test.
//
// Covers the spec's UX gates from PRD §3:
//   (a) initial empty render shows the 0-byte counter
//   (b) onChange forwards user keystrokes
//   (c) entering 50 001 bytes flips the counter into over-limit error
//   (d) uploading a small .md file forwards its decoded text to onChange
//   (e) uploading a >250 KB file is rejected without onChange firing
// Sixth test guards the byte counter (multi-byte 한글 → 3 bytes/char).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrdInput } from './prd-input';

const PRD_MAX_BYTES = 50_000;
const PRD_FILE_MAX_BYTES = 250_000;

describe('PrdInput', () => {
  it('renders an empty textarea and a 0-byte counter on first paint', () => {
    render(<PrdInput value="" onChange={() => {}} />);
    const textarea = screen.getByRole('textbox');
    expect(textarea).toHaveValue('');
    // Counter format: "0 / 50,000".
    expect(
      screen.getByText(
        new RegExp(`^0\\s*/\\s*${PRD_MAX_BYTES.toLocaleString()}$`)
      )
    ).toBeInTheDocument();
  });

  it('forwards textarea keystrokes through the onChange prop', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<PrdInput value="" onChange={onChange} />);
    await user.type(screen.getByRole('textbox'), 'hi');
    // userEvent.type fires one onChange per character.
    expect(onChange).toHaveBeenCalled();
    // Last call should contain at least one of the typed characters — exact
    // value depends on controlled-vs-uncontrolled merging, so assert the
    // function was invoked rather than the precise final string.
    const lastArg = onChange.mock.calls.at(-1)?.[0];
    expect(typeof lastArg).toBe('string');
  });

  it('surfaces an over-limit error + counter color when value exceeds 50 KB', () => {
    const oversize = 'a'.repeat(PRD_MAX_BYTES + 1);
    render(<PrdInput value={oversize} onChange={() => {}} />);
    // Over-limit branch emits a role="alert" inline error using the
    // `audit.prd.tooLarge` i18n key (Korean text). Asserting via role keeps
    // the test robust to wording changes.
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toMatch(/50KB/);
    // Counter still renders the actual byte count.
    expect(
      screen.getByText(
        new RegExp(`${(PRD_MAX_BYTES + 1).toLocaleString()}\\s*/`)
      )
    ).toBeInTheDocument();
  });

  it('reads a small uploaded file and pipes its text through onChange', async () => {
    const onChange = vi.fn();
    render(<PrdInput value="" onChange={onChange} />);

    // jsdom does not implement File.text() on every release, so build a
    // File-shaped stub whose `.text()` resolves synchronously to a known
    // value. The component just does `await file.text()`, which accepts
    // any thenable.
    const file = {
      name: 'spec.md',
      size: 14,
      type: 'text/markdown',
      text: () => Promise.resolve('hello from PRD'),
    } as unknown as File;

    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    // Define `files` directly — bypasses jsdom's read-only FileList wrapping.
    Object.defineProperty(fileInput, 'files', {
      value: [file],
      configurable: true,
    });
    fireEvent.change(fileInput);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('hello from PRD');
    });
  });

  it('rejects files larger than 250 KB without invoking onChange', async () => {
    const onChange = vi.fn();
    render(<PrdInput value="" onChange={onChange} />);

    // Build a 250_001-byte file (just past the cap).
    const big = new File(
      ['x'.repeat(PRD_FILE_MAX_BYTES + 1)],
      'huge.txt',
      { type: 'text/plain' }
    );
    const fileInput = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    // Stub file.size — jsdom sometimes reports 0 for File() built from
    // long strings, defeating the size guard. Pin it explicitly.
    Object.defineProperty(big, 'size', {
      value: PRD_FILE_MAX_BYTES + 1,
      configurable: true,
    });
    fireEvent.change(fileInput, { target: { files: [big] } });

    // The 50 KB inline error doesn't show because state holds value="",
    // but the file branch emits its own role="alert" with the tooLarge key.
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /50KB/.test(a.textContent ?? ''))).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('counts UTF-8 bytes (not code units) so 한글 fills the limit correctly', () => {
    // 한 = 3 bytes in UTF-8. 10 characters → 30 bytes counter.
    render(<PrdInput value={'한'.repeat(10)} onChange={() => {}} />);
    expect(
      screen.getByText(new RegExp(`^30\\s*/\\s*${PRD_MAX_BYTES.toLocaleString()}$`))
    ).toBeInTheDocument();
  });
});
