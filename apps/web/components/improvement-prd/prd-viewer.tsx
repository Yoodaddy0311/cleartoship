import { Card, CardBody } from '@cleartoship/ui';
import { MarkdownViewer } from '@/components/report/markdown-viewer';

export function PrdViewer({ markdown }: { markdown: string }) {
  return (
    <Card variant="glass" padding="lg">
      <CardBody>
        <MarkdownViewer markdown={markdown} />
      </CardBody>
    </Card>
  );
}
