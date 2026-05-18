'use client';

import * as React from 'react';
import { Card, CardBody, CardHeader, CardTitle, Skeleton } from '@cleartoship/ui';

/**
 * First-paint placeholder for the audit progress page. Renders while the
 * polling hook is still resolving the initial GET /audit-runs/:id call.
 * Mirrors the live page's two-column layout so layout shift is minimal once
 * real data arrives.
 */
export function ColdStartSkeleton(): React.JSX.Element {
  return (
    <div
      aria-busy="true"
      aria-label="감사 진행 상황을 불러오는 중"
      className="flex flex-col gap-6"
    >
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card variant="default" padding="md">
          <CardHeader>
            <CardTitle>분석 단계</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="flex flex-col gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3 w-32" />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card variant="default" padding="md" className="min-h-[420px]">
          <CardHeader>
            <CardTitle>실시간 분석 결과</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-64" />
              <Skeleton className="h-4 w-40" />
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
