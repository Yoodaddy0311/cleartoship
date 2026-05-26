// Phase G.1 — RepoTreeView (MVP)
//
// Collapsible left-rail tree that surfaces the repo's structural skeleton —
// pages, API endpoints, and data-model entities — derived from the existing
// source-driven inventories (`RouteInventory` from PR-A3, `DataModelInventory`
// from PR-A2). Goal: give non-developer founders a single glance at "what's
// in this codebase" without scrolling through findings.
//
// Scope (MVP, per visual-audit-vision V3 + briefing):
//   - 3 top-level categories: Pages / API / Data Models. Each collapsible.
//   - Per-category counts on the header so a collapsed tree still shows scale.
//   - Click a leaf node → fires `onSelectRoute(routeId)`. The dashboard owner
//     decides what to do with the selection (PageCard highlight / detail panel
//     in a follow-up PR).
//   - Empty inventory → friendly message, no crash.
//   - Keyboard nav: native <button> + <details>/<summary>; arrow keys are
//     deferred to a later pass once we wire the selection panel.
//
// Out of scope (Phase 2):
//   - Drag-to-reorder, multi-select, nested folder-style grouping per segment.
//   - Search/filter input.
//   - Visual edges (page → API → model) — that's the FeatureGraph tab's job.
//
// Why <details>/<summary> instead of a custom disclosure widget:
//   - Free keyboard support (Enter/Space toggle) + ARIA expanded/collapsed
//     semantics in every modern browser.
//   - SSR-friendly (no useState gymnastics for initial render).
//   - We keep `open` defaulted to true so the tree paints fully expanded —
//     non-developers won't think to click to expand.

'use client';

import type {
  DataModelEntity,
  DataModelInventory,
  RouteEntry,
  RouteInventory,
} from '@cleartoship/shared-types';

export interface RepoTreeViewProps {
  routeInventory: RouteInventory;
  dataModelInventory?: DataModelInventory;
  /**
   * Stable id of the currently-selected route, mirrored back into the tree
   * for the selected-row outline. Use {@link routeEntryId} to derive ids
   * outside this component so producer + consumer agree on the format.
   */
  selectedRouteId?: string;
  /**
   * Fired when the user clicks any leaf (page, api, or data model entity).
   * The id format is `${type}:${urlPath|entityName}` — see
   * {@link routeEntryId} / {@link dataModelEntityId}.
   */
  onSelectRoute?: (routeId: string) => void;
}

/**
 * Canonical id format for a route leaf. Exported so callers that own the
 * selection state (the dashboard page) can compare against `selectedRouteId`
 * without re-implementing the format.
 */
export function routeEntryId(entry: RouteEntry): string {
  return `route:${entry.type}:${entry.urlPath}`;
}

export function dataModelEntityId(entity: DataModelEntity): string {
  return `model:${entity.name}`;
}

export function RepoTreeView({
  routeInventory,
  dataModelInventory,
  selectedRouteId,
  onSelectRoute,
}: RepoTreeViewProps) {
  const pages = routeInventory.routes.filter((r) => r.type === 'page');
  const apis = routeInventory.routes.filter((r) => r.type === 'api');
  const models = dataModelInventory?.entities ?? [];

  const totalLeaves = pages.length + apis.length + models.length;

  if (totalLeaves === 0) {
    return (
      <aside
        data-testid="repo-tree-view"
        aria-label="저장소 구조"
        className="flex flex-col gap-3 rounded-[12px] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4"
      >
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]">
          저장소 구조
        </h2>
        <p
          data-testid="repo-tree-empty"
          className="text-sm text-[color:var(--color-fg-muted)]"
        >
          분석된 페이지/API가 없습니다.
        </p>
      </aside>
    );
  }

  return (
    <aside
      data-testid="repo-tree-view"
      aria-label="저장소 구조"
      className="flex flex-col gap-3 rounded-[12px] border border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-4"
    >
      <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--color-fg-muted)]">
        저장소 구조
      </h2>

      <TreeSection
        testid="repo-tree-section-pages"
        icon="📄"
        label="페이지"
        count={pages.length}
      >
        {pages.length === 0 ? (
          <EmptyLeaf message="페이지 없음" />
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {pages.map((entry) => (
              <RouteLeaf
                key={routeEntryId(entry)}
                entry={entry}
                selected={selectedRouteId === routeEntryId(entry)}
                onSelect={onSelectRoute}
              />
            ))}
          </ul>
        )}
      </TreeSection>

      <TreeSection
        testid="repo-tree-section-api"
        icon="🔌"
        label="API 엔드포인트"
        count={apis.length}
      >
        {apis.length === 0 ? (
          <EmptyLeaf message="API 엔드포인트 없음" />
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {apis.map((entry) => (
              <RouteLeaf
                key={routeEntryId(entry)}
                entry={entry}
                selected={selectedRouteId === routeEntryId(entry)}
                onSelect={onSelectRoute}
              />
            ))}
          </ul>
        )}
      </TreeSection>

      <TreeSection
        testid="repo-tree-section-models"
        icon="🗄️"
        label="데이터 모델"
        count={models.length}
      >
        {models.length === 0 ? (
          <EmptyLeaf
            message={
              dataModelInventory && dataModelInventory.tech !== 'none'
                ? `${dataModelInventory.tech} 모델 없음`
                : '데이터 모델 없음'
            }
          />
        ) : (
          <ul role="list" className="flex flex-col gap-0.5">
            {models.map((entity) => (
              <DataModelLeaf
                key={dataModelEntityId(entity)}
                entity={entity}
                selected={selectedRouteId === dataModelEntityId(entity)}
                onSelect={onSelectRoute}
              />
            ))}
          </ul>
        )}
      </TreeSection>
    </aside>
  );
}

function TreeSection({
  testid,
  icon,
  label,
  count,
  children,
}: {
  testid: string;
  icon: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <details
      data-testid={testid}
      open
      className="group rounded-[8px] [&_summary::-webkit-details-marker]:hidden"
    >
      <summary
        className="flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-2 py-1.5 text-sm font-medium text-[color:var(--app-fg)] hover:bg-[color:var(--app-chip-bg)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-4 w-4 items-center justify-center text-[color:var(--color-fg-muted)] transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        <span aria-hidden="true">{icon}</span>
        <span>{label}</span>
        <span
          data-testid={`${testid}-count`}
          className="ml-auto rounded-full bg-[color:var(--app-chip-bg)] px-2 py-0.5 font-mono text-xs tabular-nums text-[color:var(--color-fg-muted)]"
        >
          {count}
        </span>
      </summary>
      <div className="mt-1 pl-6">{children}</div>
    </details>
  );
}

function EmptyLeaf({ message }: { message: string }) {
  return (
    <p className="px-2 py-1 text-xs text-[color:var(--color-fg-muted)]">
      {message}
    </p>
  );
}

function RouteLeaf({
  entry,
  selected,
  onSelect,
}: {
  entry: RouteEntry;
  selected: boolean;
  onSelect: ((routeId: string) => void) | undefined;
}) {
  const id = routeEntryId(entry);
  const isInteractive = typeof onSelect === 'function';

  const inner = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-mono text-xs text-[color:var(--app-fg)]">
        {entry.urlPath}
      </span>
      {entry.hasDynamic ? (
        <span
          aria-label="동적 라우트"
          title="동적 라우트"
          className="rounded bg-[color:var(--app-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-fg-muted)]"
        >
          dyn
        </span>
      ) : null}
      {entry.hasCatchAll ? (
        <span
          aria-label="catch-all 라우트"
          title="catch-all 라우트"
          className="rounded bg-[color:var(--app-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-fg-muted)]"
        >
          *
        </span>
      ) : null}
    </span>
  );

  const baseClass =
    'flex w-full items-center rounded-[6px] px-2 py-1 text-left text-sm transition-colors';
  const selectedClass = selected
    ? 'bg-[color-mix(in_oklch,var(--mk-accent-2)_18%,transparent)] text-[color:var(--app-fg)]'
    : 'text-[color:var(--color-fg-muted)] hover:bg-[color:var(--app-chip-bg)] hover:text-[color:var(--app-fg)]';

  if (!isInteractive) {
    return (
      <li>
        <div
          data-testid={`repo-tree-leaf-${id}`}
          data-route-id={id}
          className={`${baseClass} ${selectedClass} cursor-default`}
          title={entry.sourceFile}
        >
          {inner}
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        data-testid={`repo-tree-leaf-${id}`}
        data-route-id={id}
        aria-pressed={selected}
        title={entry.sourceFile}
        onClick={() => onSelect(id)}
        className={`${baseClass} ${selectedClass} focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]`}
      >
        {inner}
      </button>
    </li>
  );
}

function DataModelLeaf({
  entity,
  selected,
  onSelect,
}: {
  entity: DataModelEntity;
  selected: boolean;
  onSelect: ((routeId: string) => void) | undefined;
}) {
  const id = dataModelEntityId(entity);
  const isInteractive = typeof onSelect === 'function';

  const inner = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="truncate font-mono text-xs text-[color:var(--app-fg)]">
        {entity.name}
      </span>
      {entity.fieldCount !== null ? (
        <span
          aria-label={`${entity.fieldCount}개 필드`}
          className="rounded bg-[color:var(--app-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-fg-muted)]"
        >
          {entity.fieldCount}f
        </span>
      ) : null}
      {entity.hasRelations ? (
        <span
          aria-label="관계 있음"
          title="관계 있음"
          className="rounded bg-[color:var(--app-chip-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--color-fg-muted)]"
        >
          rel
        </span>
      ) : null}
    </span>
  );

  const baseClass =
    'flex w-full items-center rounded-[6px] px-2 py-1 text-left text-sm transition-colors';
  const selectedClass = selected
    ? 'bg-[color-mix(in_oklch,var(--mk-accent-2)_18%,transparent)] text-[color:var(--app-fg)]'
    : 'text-[color:var(--color-fg-muted)] hover:bg-[color:var(--app-chip-bg)] hover:text-[color:var(--app-fg)]';

  if (!isInteractive) {
    return (
      <li>
        <div
          data-testid={`repo-tree-leaf-${id}`}
          data-route-id={id}
          className={`${baseClass} ${selectedClass} cursor-default`}
          title={entity.sourceFile}
        >
          {inner}
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        data-testid={`repo-tree-leaf-${id}`}
        data-route-id={id}
        aria-pressed={selected}
        title={entity.sourceFile}
        onClick={() => onSelect(id)}
        className={`${baseClass} ${selectedClass} focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]`}
      >
        {inner}
      </button>
    </li>
  );
}
