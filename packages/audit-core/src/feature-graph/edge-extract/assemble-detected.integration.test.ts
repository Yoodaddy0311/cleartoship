// Integration-style test: a shadcn/taxonomy-like repo on disk, run through the
// full edge-extract assembly. Asserts node + edge counts/kinds AND that NO
// test/config/story file ever becomes a node.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DataModelInventory } from '@cleartoship/shared-types';
import { buildRouteInventory } from '../route-ast/build-route-inventory.js';
import { assembleDetectedFeatures } from './assemble-detected.js';

interface FixtureFile {
  readonly path: string;
  readonly content: string;
}

// A taxonomy/shadcn-style repo: top-level components/, app/ pages, app/api/
// routes, prisma/schema.prisma, server actions, plus test/config/story noise.
const FIXTURE: ReadonlyArray<FixtureFile> = [
  {
    path: 'tsconfig.json',
    content: JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./*'] } } }),
  },
  // Pages.
  {
    path: 'app/page.tsx',
    content: `import { SiteHeader } from '@/components/site-header';
import { Hero } from '@/components/hero';
export default function Home() { return <><SiteHeader/><Hero/></>; }`,
  },
  {
    path: 'app/dashboard/page.tsx',
    content: `import { PostList } from '@/components/post-list';
import { createPost } from '@/app/actions/create-post';
export default async function Dashboard() {
  const r = await fetch('/api/posts');
  return <PostList action={createPost}/>;
}`,
  },
  // Dynamic detail page that fetches a CONCRETE id against a DYNAMIC api route.
  {
    path: 'app/posts/[id]/page.tsx',
    content: `export default async function PostDetail() {
  const r = await fetch('/api/posts/123');
  return null;
}`,
  },
  // API routes.
  {
    path: 'app/api/posts/route.ts',
    content: `import { prisma } from '@/lib/db';
export async function GET() { return Response.json(await prisma.post.findMany()); }
export async function POST() { return Response.json(await prisma.post.create({ data: {} })); }`,
  },
  {
    path: 'app/api/posts/[id]/route.ts',
    content: `import { prisma } from '@/lib/db';
export async function GET() { return Response.json(await prisma.post.findUnique({ where: {} })); }`,
  },
  // Server action.
  {
    path: 'app/actions/create-post.ts',
    content: `'use server';
import { prisma } from '@/lib/db';
export async function createPost() { await prisma.post.create({ data: {} }); }`,
  },
  // Top-level components (taxonomy pattern — NOT co-located with pages).
  { path: 'components/site-header.tsx', content: `export function SiteHeader() { return null; }` },
  { path: 'components/hero.tsx', content: `export function Hero() { return null; }` },
  { path: 'components/post-list.tsx', content: `export function PostList() { return null; }` },
  { path: 'components/ui/button.tsx', content: `export function Button() { return null; }` },
  // Lib (not a node type we track, but imported).
  { path: 'lib/db.ts', content: `export const prisma = {} as any;` },
  // Prisma schema.
  {
    path: 'prisma/schema.prisma',
    content: `model Post { id Int @id\n  title String\n}\nmodel User { id Int @id\n}`,
  },
  // ---- Noise that must NEVER become a node ----
  { path: 'components/hero.stories.tsx', content: `export default {};` },
  { path: 'components/hero.test.tsx', content: `import { describe } from 'vitest';` },
  { path: 'next.config.js', content: `module.exports = {};` },
  { path: 'vitest.config.ts', content: `export default {};` },
  { path: '__tests__/smoke.test.ts', content: `it('noop', () => {});` },
  { path: 'app/narrative.test.tsx', content: `it('noop', () => {});` },
];

const FILE_TREE = FIXTURE.map((f) => f.path);

const DATA_MODEL: DataModelInventory = {
  tech: 'prisma',
  entities: [
    { name: 'Post', fieldCount: 2, hasRelations: false, sourceFile: 'prisma/schema.prisma' },
    { name: 'User', fieldCount: 1, hasRelations: false, sourceFile: 'prisma/schema.prisma' },
  ],
  sourceFiles: ['prisma/schema.prisma'],
  confidence: 'high',
};

describe('assembleDetectedFeatures — taxonomy/shadcn integration', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'taxonomy-'));
    for (const f of FIXTURE) {
      const abs = path.join(dir, f.path);
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, f.content, 'utf8');
    }
  });

  afterEach(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
  });

  it('produces the expected node mix and excludes ALL test/config/story files', async () => {
    const routeInventory = await buildRouteInventory(dir, FILE_TREE);
    const detected = await assembleDetectedFeatures({
      clonePath: dir,
      fileTree: FILE_TREE,
      routeInventory,
      dataModelInventory: DATA_MODEL,
    });

    const byType = (t: string) => detected.filter((d) => d.type === t);

    // 3 pages (/, /dashboard, /posts/[id]), 2 apis (/api/posts, /api/posts/[id]),
    // 1 action, 4 components, 2 data models.
    expect(byType('page').length).toBe(3);
    expect(byType('api').length).toBe(2);
    expect(byType('action').length).toBe(1);
    expect(byType('component').length).toBe(4);
    expect(byType('data_model').length).toBe(2);

    // NO test/config/story file became a node.
    const labels = detected.map((d) => d.label.toLowerCase());
    expect(labels.some((l) => l.includes('.test'))).toBe(false);
    expect(labels.some((l) => l.includes('.stories'))).toBe(false);
    expect(labels.some((l) => l.includes('narrative'))).toBe(false);
    expect(labels.some((l) => l.includes('config'))).toBe(false);
    expect(detected.some((d) => d.id.includes('__tests__'))).toBe(false);
  });

  it('builds real edges that all point at existing nodes (no phantom targets)', async () => {
    const routeInventory = await buildRouteInventory(dir, FILE_TREE);
    const detected = await assembleDetectedFeatures({
      clonePath: dir,
      fileTree: FILE_TREE,
      routeInventory,
      dataModelInventory: DATA_MODEL,
    });

    const nodeIds = new Set(detected.map((d) => d.id));
    const allEdges = detected.flatMap((d) =>
      (d.edges ?? []).map((e) => ({ source: d.id, ...e })),
    );

    // Every edge target resolves to a real node.
    for (const e of allEdges) {
      expect(nodeIds.has(e.target)).toBe(true);
    }

    // Home page → contains site-header + hero.
    const home = detected.find((d) => d.type === 'page' && d.label === '홈')!;
    expect(home.edges?.filter((e) => e.type === 'contains').length).toBeGreaterThanOrEqual(2);

    // Dashboard → calls_api to /api/posts + triggers the create-post action.
    const dash = detected.find((d) => d.type === 'page' && d.label === '/dashboard')!;
    expect(dash.edges?.some((e) => e.type === 'calls_api')).toBe(true);
    expect(dash.edges?.some((e) => e.type === 'triggers')).toBe(true);
    expect(dash.status).toBe('complete'); // reaches the backend.

    // The /api/posts route → reads_from + writes_to the Post data model.
    const api = detected.find((d) => d.type === 'api' && d.label === '/api/posts')!;
    expect(api.edges?.some((e) => e.type === 'reads_from' && e.target === 'data_model.Post')).toBe(true);
    expect(api.edges?.some((e) => e.type === 'writes_to' && e.target === 'data_model.Post')).toBe(true);
    expect(api.status).toBe('complete'); // has an inbound caller.

    // DYNAMIC ROUTE (HIGH-2 regression): the /posts/[id] page fetches the
    // CONCRETE url /api/posts/123, which must resolve to the inventoried
    // dynamic api node /api/posts/[id] as a real calls_api edge — NOT a
    // fabricated missing node, and the page must be `complete`, not partial/ui_only.
    const dynApiNode = detected.find((d) => d.type === 'api' && d.label === '/api/posts/[id]')!;
    expect(dynApiNode).toBeDefined();
    const detailPage = detected.find((d) => d.type === 'page' && d.label === '/posts/[id]')!;
    expect(detailPage.edges?.some((e) => e.type === 'calls_api' && e.target === dynApiNode.id)).toBe(true);
    expect(detailPage.edges?.some((e) => e.type === 'missing_link')).toBe(false);
    expect(detailPage.status).toBe('complete');
    // No spurious `missing` node was fabricated anywhere in the graph.
    expect(detected.some((d) => d.status === 'missing')).toBe(false);
    expect(dynApiNode.status).toBe('complete'); // has the detail page as caller.

    // There must be a meaningful number of edges (the old code produced ~0).
    expect(allEdges.length).toBeGreaterThanOrEqual(5);
  });

  it('preserves status=missing on the fabricated missing-api node after end-to-end assembly (HIGH regression)', async () => {
    // A focused mini-fixture: a single page that fetches an undefined API
    // route. The extractor creates a `missing` api node with status='missing';
    // deriveNodeStatus must NOT overwrite that to 'logic_only', otherwise the
    // canvas renders the gap with the wrong visual treatment.
    const ghostDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'ghost-fetch-'));
    try {
      await fsp.mkdir(path.join(ghostDir, 'app/form'), { recursive: true });
      await fsp.writeFile(
        path.join(ghostDir, 'app/form/page.tsx'),
        `export default function P() { fetch('/api/ghost'); return null; }`,
        'utf8',
      );
      const fileTree = ['app/form/page.tsx'];
      const routeInventory = await buildRouteInventory(ghostDir, fileTree);
      const detected = await assembleDetectedFeatures({
        clonePath: ghostDir,
        fileTree,
        routeInventory,
        dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
      });

      // THE assertion that exercises the HIGH fix: deriveNodeStatus must NOT
      // downgrade the extractor-created 'missing' api node to 'logic_only'.
      // Search by status='missing' (not by id prefix) so the assertion is
      // immune to the missingId mangling format in scanFetches.
      const missingNode = detected.find((d) => d.status === 'missing');
      expect(missingNode).toBeDefined();
      expect(missingNode!.type).toBe('api');
      expect(missingNode!.id).toMatch(/^missing\.api\./);

      // The page itself reaches a missing target → partial (not ui_only).
      const formPage = detected.find((d) => d.type === 'page' && d.label === '/form');
      expect(formPage).toBeDefined();
      expect(formPage!.status).toBe('partial');
      expect(formPage!.edges?.some((e) => e.type === 'missing_link' && e.target === missingNode!.id)).toBe(true);
    } finally {
      await fsp.rm(ghostDir, { recursive: true, force: true });
    }
  });
});
