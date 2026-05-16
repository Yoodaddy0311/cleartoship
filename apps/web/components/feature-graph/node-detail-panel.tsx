import { Card, CardBody, CardHeader, CardTitle, Badge } from '@cleartoship/ui';
import { StatusChip } from '@/components/common/status-chip';
import { t } from '@/lib/i18n';
import type { MockNode } from '@/lib/mock/audit-fixture';

export function NodeDetailPanel({ node }: { node: MockNode | null }) {
  if (!node) {
    return (
      <Card variant="default" padding="md" className="h-full">
        <CardBody>
          <p className="text-sm text-[color:var(--color-fg-muted)]">
            그래프에서 노드를 선택하면 상세 정보가 표시됩니다.
          </p>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card variant="default" padding="md" className="h-full">
      <CardHeader>
        <div className="flex flex-col gap-2">
          <CardTitle>{node.label}</CardTitle>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="neutral">{node.type}</Badge>
            <StatusChip status={node.status} />
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <dl className="flex flex-col gap-3 text-sm">
          {node.summary ? (
            <div>
              <dt className="text-xs text-[color:var(--color-fg-muted)]">
                {t('graph.node.summary')}
              </dt>
              <dd className="text-[color:var(--color-fg-primary)]">{node.summary}</dd>
            </div>
          ) : null}
        </dl>
      </CardBody>
    </Card>
  );
}
