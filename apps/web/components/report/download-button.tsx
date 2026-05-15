'use client';

import { Download } from 'lucide-react';
import { Button } from '@cleartoship/ui';

export function DownloadMarkdownButton({
  filename,
  markdown,
  label,
}: {
  filename: string;
  markdown: string;
  label: string;
}) {
  function handleDownload() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleDownload}
      leadingIcon={<Download className="h-4 w-4" />}
    >
      {label}
    </Button>
  );
}
