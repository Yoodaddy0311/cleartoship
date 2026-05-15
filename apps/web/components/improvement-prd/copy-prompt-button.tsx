'use client';

import { useState } from 'react';
import { Check, ClipboardCopy } from 'lucide-react';
import { Button } from '@cleartoship/ui';
import { t } from '@/lib/i18n';

/**
 * Copies the entire improvement PRD markdown to the clipboard,
 * intended as a "vibe coding prompt" — paste directly into Claude/Cursor.
 */
export function CopyPromptButton({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <Button
      type="button"
      variant="primary"
      onClick={handleCopy}
      leadingIcon={
        copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />
      }
      aria-live="polite"
    >
      {copied ? t('prd.copied') : t('prd.copyPrompt')}
    </Button>
  );
}
