// Tests for step05DetectFeatures — covers status branching (partial / ui_only /
// logic_only / unknown), new node types (component, action, auth_guard,
// external_service), and new edges (requires_auth, missing_link, contains).

import { describe, expect, it, vi } from 'vitest';
import type { WorkerCtx } from '../../adapters/index.js';
import { createInitialState, type PipelineState } from './index.js';
import { step05DetectFeatures } from './05-detect-features.js';

function makeCtx(): WorkerCtx {
  return {
    runId: 'run-1',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    profileId: null,
    clonePath: '/tmp/cleartoship-run-1',
    log: vi.fn(),
  };
}

function stateWith(fileTree: string[]): PipelineState {
  const s = createInitialState();
  s.fileTree = fileTree;
  return s;
}

describe('step05DetectFeatures — base behavior preserved', () => {
  it('emits page + api + data_model nodes from a Next.js App tree (partial status when balanced)', async () => {
    const state = stateWith([
      'app/dashboard/page.tsx',
      'app/api/dashboard/route.ts',
      'prisma/schema.prisma',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const page = state.detectedFeatures.find((f) => f.type === 'page');
    const api = state.detectedFeatures.find((f) => f.type === 'api');
    const dm = state.detectedFeatures.find((f) => f.type === 'data_model');
    expect(page?.label).toBe('/dashboard');
    expect(page?.status).toBe('partial');
    expect(api?.label).toBe('/api/dashboard');
    expect(api?.status).toBe('partial');
    expect(dm?.id).toBe('data_model.prisma');
    expect(page?.edges?.some((e) => e.type === 'calls_api' && e.target === api?.id)).toBe(true);
  });
});

describe('step05DetectFeatures — status branching', () => {
  it('marks page as ui_only when no matching API exists and emits missing_link edge', async () => {
    const state = stateWith(['app/orphan/page.tsx']);

    await step05DetectFeatures.execute(makeCtx(), state);

    const page = state.detectedFeatures.find((f) => f.type === 'page');
    expect(page?.status).toBe('ui_only');
    expect(page?.edges?.some((e) => e.type === 'missing_link')).toBe(true);
  });

  it('marks api as logic_only when no matching page exists', async () => {
    const state = stateWith(['app/api/billing/route.ts']);

    await step05DetectFeatures.execute(makeCtx(), state);

    const api = state.detectedFeatures.find((f) => f.type === 'api');
    expect(api?.status).toBe('logic_only');
  });

  it('component nodes default to status=unknown when source is not inspected', async () => {
    const state = stateWith([
      'app/dashboard/page.tsx',
      'app/api/dashboard/route.ts',
      'components/Button.tsx',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const component = state.detectedFeatures.find((f) => f.type === 'component');
    expect(component?.label).toBe('Button');
    expect(component?.status).toBe('unknown');
  });
});

describe('step05DetectFeatures — new node types', () => {
  it('emits auth_guard node when middleware.ts is present', async () => {
    const state = stateWith([
      'app/page.tsx',
      'app/api/x/route.ts',
      'middleware.ts',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const guard = state.detectedFeatures.find((f) => f.type === 'auth_guard');
    expect(guard).toBeDefined();
    expect(guard?.status).toBe('partial');
    expect(guard?.confidence).toBe('HIGH');
  });

  it('emits auth_guard with ui_only status when only (authenticated) group exists (no middleware)', async () => {
    const state = stateWith([
      'app/(authenticated)/dashboard/page.tsx',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const guard = state.detectedFeatures.find((f) => f.type === 'auth_guard');
    expect(guard).toBeDefined();
    expect(guard?.status).toBe('ui_only');
  });

  it('does not emit auth_guard when neither middleware nor protected group exists', async () => {
    const state = stateWith(['app/page.tsx']);

    await step05DetectFeatures.execute(makeCtx(), state);

    expect(state.detectedFeatures.find((f) => f.type === 'auth_guard')).toBeUndefined();
  });

  it('emits action nodes from actions/ directories', async () => {
    const state = stateWith([
      'app/dashboard/page.tsx',
      'app/dashboard/actions/createInvoice.ts',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const action = state.detectedFeatures.find((f) => f.type === 'action');
    expect(action?.label).toBe('createInvoice');
    expect(action?.status).toBe('unknown');
  });

  it('emits external_service nodes when .env.example is present', async () => {
    const state = stateWith([
      'app/page.tsx',
      '.env.example',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const externals = state.detectedFeatures.filter((f) => f.type === 'external_service');
    expect(externals.length).toBeGreaterThan(0);
    expect(externals.every((e) => e.status === 'unknown')).toBe(true);
  });
});

describe('step05DetectFeatures — new edges', () => {
  it('emits requires_auth edge from a page inside (authenticated) to the auth_guard node', async () => {
    const state = stateWith([
      'app/(authenticated)/dashboard/page.tsx',
      'middleware.ts',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const page = state.detectedFeatures.find((f) => f.type === 'page');
    const guard = state.detectedFeatures.find((f) => f.type === 'auth_guard');
    expect(page).toBeDefined();
    expect(guard).toBeDefined();
    expect(
      page?.edges?.some((e) => e.type === 'requires_auth' && e.target === guard?.id),
    ).toBe(true);
  });

  it('emits missing_link edge from a page when no corresponding API exists', async () => {
    const state = stateWith(['app/settings/page.tsx']);

    await step05DetectFeatures.execute(makeCtx(), state);

    const page = state.detectedFeatures.find((f) => f.type === 'page');
    const missingLink = page?.edges?.find((e) => e.type === 'missing_link');
    expect(missingLink).toBeDefined();
    expect(missingLink?.target).toContain('settings');
  });

  it('emits contains edge from page to component when they share a directory', async () => {
    const state = stateWith([
      'app/dashboard/page.tsx',
      'app/dashboard/components/Chart.tsx',
    ]);

    await step05DetectFeatures.execute(makeCtx(), state);

    const page = state.detectedFeatures.find((f) => f.type === 'page');
    const chart = state.detectedFeatures.find(
      (f) => f.type === 'component' && f.label === 'Chart',
    );
    expect(chart).toBeDefined();
    expect(
      page?.edges?.some((e) => e.type === 'contains' && e.target === chart?.id),
    ).toBe(true);
  });
});

describe('step05DetectFeatures — empty input', () => {
  it('produces no features when the file tree is empty', async () => {
    const state = stateWith([]);

    await step05DetectFeatures.execute(makeCtx(), state);

    expect(state.detectedFeatures).toEqual([]);
  });
});
