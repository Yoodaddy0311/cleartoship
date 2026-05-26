// Phase G.4 — PageCardGrid
//
// Responsive grid of `PageCard` tiles, one per page in the audit's
// `RouteInventory`. API routes are excluded by design — they belong in the
// RepoTreeView's API section, not in a UI-page grid that a non-developer
// reads as "your screens". Phase 2 may add a sibling `ApiCardGrid` once we
// have per-endpoint health.
//
// Layout:
//   - mobile (<sm): 1 col
//   - sm: 2 cols
//   - lg+: 3 cols
// Cards stretch to fill their cell; `PageCard` pins min-height so rows align.
//
// Finding → page mapping (MVP):
//   We don't yet have a robust mapping from `Finding.category` to a specific
//   page URL. Until per-finding `source.path` resolves to a route, we pass
//   `findingCount` only when `findings` prop is present AND the briefing's
//   "optional, 페이지별 finding count" intent is honoured by simply counting
//   findings whose evidence path starts with the route's directory. Today we
//   skip that heuristic — `findingCount` stays undefined and PageCard renders
//   "준비 중" status. The hook is in place for Phase 2 without touching the
//   call site.

'use client';

import type { Finding, RouteInventory } from '@cleartoship/shared-types';
import { PageCard } from './page-card';
import { routeEntryId } from './repo-tree-view';

export interface PageCardGridProps {
  routeInventory: RouteInventory;
  findings?: Finding[];
  selectedRouteId?: string;
  onSelectPage?: (routeId: string) => void;
}

export function PageCardGrid({
  routeInventory,
  findings: _findings,
  selectedRouteId,
  onSelectPage,
}: PageCardGridProps) {
  const pages = routeInventory.routes.filter((r) => r.type === 'page');

  if (pages.length === 0) {
    return (
      <section
        data-testid="page-card-grid"
        aria-label="페이지 카드 그리드"
        className="rounded-[12px] border border-dashed border-[color:var(--app-border)] bg-[color:var(--app-surface)] p-6"
      >
        <p
          data-testid="page-card-grid-empty"
          className="text-sm text-[color:var(--color-fg-muted)]"
        >
          분석된 페이지가 없습니다. App Router(`app/**/page.tsx`) 또는 Pages
          Router(`pages/**/*.tsx`) 파일이 발견되지 않았어요.
        </p>
      </section>
    );
  }

  return (
    <section
      data-testid="page-card-grid"
      aria-label="페이지 카드 그리드"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {pages.map((entry) => {
        const id = routeEntryId(entry);
        return (
          <PageCard
            key={id}
            entry={entry}
            routeId={id}
            selected={selectedRouteId === id}
            onSelect={onSelectPage}
          />
        );
      })}
    </section>
  );
}
