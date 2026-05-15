'use client';

import { useMemo, useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type EdgeTypes,
  type NodeTypes,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FeatureGraphNode } from '@cleartoship/ui';
import { NodeDetailPanel } from './node-detail-panel';
import { StatusLegend } from './status-legend';
import { ALL_STATUSES, type ImplementationStatus } from '@/lib/format/status';
import type { MockNode, MockEdge } from '@/lib/mock/audit-fixture';

interface NodeData {
  label: string;
  type: MockNode['type'];
  status: ImplementationStatus;
  summary?: string;
}

const nodeTypes: NodeTypes = {
  feature: (props: NodeProps<NodeData>) => (
    <FeatureGraphNode
      type={props.data.type}
      status={props.data.status}
      label={props.data.label}
      summary={props.data.summary ?? undefined}
      selected={props.selected}
    />
  ),
};

const edgeTypes: EdgeTypes = {};

function edgeStyle(type: MockEdge['type']): { style: React.CSSProperties; animated?: boolean; label?: string } {
  switch (type) {
    case 'calls_api':
      return { style: { stroke: 'var(--color-aurora-violet)', strokeWidth: 1.5 } };
    case 'missing_link':
      return {
        style: {
          stroke: 'var(--color-severity-p0)',
          strokeWidth: 1.5,
          strokeDasharray: '6 4',
        },
        label: '✕',
      };
    case 'recommended_connection':
      return {
        style: {
          stroke: 'var(--color-status-recommended)',
          strokeWidth: 1.5,
          strokeDasharray: '2 4',
        },
        label: '+',
      };
    default:
      return { style: { stroke: 'var(--color-border-emphasis)', strokeWidth: 1 } };
  }
}

export function GraphCanvas({
  nodes,
  edges,
}: {
  nodes: MockNode[];
  edges: MockEdge[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Set<ImplementationStatus>>(
    new Set(ALL_STATUSES)
  );

  const rfNodes: Node<NodeData>[] = useMemo(
    () =>
      nodes
        .filter((n) => statusFilter.has(n.status))
        .map<Node<NodeData>>((n) => ({
          id: n.id,
          type: 'feature',
          position: n.position,
          data: {
            label: n.label,
            type: n.type,
            status: n.status,
            ...(n.summary !== undefined ? { summary: n.summary } : {}),
          },
        })),
    [nodes, statusFilter]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      edges
        .filter((e) => {
          const src = nodes.find((n) => n.id === e.source);
          const tgt = nodes.find((n) => n.id === e.target);
          return src && tgt && statusFilter.has(src.status) && statusFilter.has(tgt.status);
        })
        .map<Edge>((e) => {
          const styling = edgeStyle(e.type);
          return {
            id: e.id,
            source: e.source,
            target: e.target,
            style: styling.style,
            ...(styling.label !== undefined ? { label: styling.label } : {}),
            labelStyle: {
              fill: 'var(--color-fg-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
            },
            labelBgStyle: {
              fill: 'var(--color-bg-elevated)',
            },
          };
        }),
    [edges, nodes, statusFilter]
  );

  const selected = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const onNodeClick = useCallback((_evt: React.MouseEvent, node: Node) => {
    setSelectedId(node.id);
  }, []);

  const toggleStatus = useCallback((s: ImplementationStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <StatusLegend active={statusFilter} onToggle={toggleStatus} />
        <div
          className="h-[60vh] min-h-[420px] overflow-hidden rounded-[16px] border border-[color:var(--color-border-subtle)]"
          style={{ background: 'var(--color-bg-elevated)' }}
        >
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeClick={onNodeClick}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} size={1} color="rgba(255,255,255,0.05)" />
            <Controls
              position="bottom-right"
              showInteractive={false}
              className="!bg-[color:var(--color-bg-elevated)] !border !border-[color:var(--color-border-subtle)]"
            />
            <MiniMap
              pannable
              zoomable
              maskColor="rgba(7,7,11,0.6)"
              style={{ background: 'var(--color-bg-elevated)' }}
            />
          </ReactFlow>
        </div>
      </div>
      <NodeDetailPanel node={selected} />
    </div>
  );
}
