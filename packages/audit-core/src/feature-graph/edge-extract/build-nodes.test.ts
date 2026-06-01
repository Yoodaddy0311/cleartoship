import { describe, it, expect } from 'vitest';
import type {
  DataModelInventory,
  RouteInventory,
} from '@cleartoship/shared-types';
import { buildNodes } from './build-nodes.js';

function inv(routes: RouteInventory['routes']): RouteInventory {
  return {
    routes,
    counts: {
      pages: routes.filter((r) => r.type === 'page').length,
      apis: routes.filter((r) => r.type === 'api').length,
      dynamic: routes.filter((r) => r.hasDynamic).length,
      byFramework: {} as RouteInventory['counts']['byFramework'],
    },
    hasNextJs: routes.length > 0,
    isEmpty: routes.length === 0,
  };
}

const PAGE = (urlPath: string, sourceFile: string): RouteInventory['routes'][number] => ({
  urlPath,
  framework: 'next-app',
  type: 'page',
  sourceFile,
  segments: [],
  hasDynamic: false,
  hasCatchAll: false,
});

const API = (urlPath: string, sourceFile: string): RouteInventory['routes'][number] => ({
  urlPath,
  framework: 'next-app-api',
  type: 'api',
  sourceFile,
  segments: [],
  hasDynamic: false,
  hasCatchAll: false,
});

const dataModel: DataModelInventory = {
  tech: 'prisma',
  entities: [
    { name: 'Post', fieldCount: 4, hasRelations: true, sourceFile: 'prisma/schema.prisma' },
    { name: 'User', fieldCount: 6, hasRelations: true, sourceFile: 'prisma/schema.prisma' },
  ],
  sourceFiles: ['prisma/schema.prisma'],
  confidence: 'high',
};

describe('buildNodes', () => {
  it('builds page + api nodes from the route inventory (not file globs)', () => {
    const routeInventory = inv([
      PAGE('/dashboard', 'app/dashboard/page.tsx'),
      API('/api/posts', 'app/api/posts/route.ts'),
    ]);
    const { nodes } = buildNodes({
      fileTree: ['app/dashboard/page.tsx', 'app/api/posts/route.ts'],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    const page = nodes.find((n) => n.type === 'page');
    const api = nodes.find((n) => n.type === 'api');
    expect(page?.label).toBe('/dashboard');
    expect(api?.label).toBe('/api/posts');
  });

  it('builds component nodes from top-level components/ dir (taxonomy pattern)', () => {
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes } = buildNodes({
      fileTree: [
        'app/page.tsx',
        'components/ui/button.tsx',
        'components/site-header.tsx',
      ],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    const components = nodes.filter((n) => n.type === 'component');
    expect(components.length).toBe(2);
    expect(components.some((c) => c.label === 'button')).toBe(true);
    expect(components.some((c) => c.label === 'site-header')).toBe(true);
  });

  it('builds action nodes from actions/ dirs', () => {
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes } = buildNodes({
      fileTree: ['app/page.tsx', 'app/actions/create-post.ts'],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    expect(nodes.some((n) => n.type === 'action' && n.label === 'create-post')).toBe(true);
  });

  it('builds data_model nodes from the data model inventory entities', () => {
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes } = buildNodes({
      fileTree: ['app/page.tsx', 'prisma/schema.prisma'],
      routeInventory,
      dataModelInventory: dataModel,
    });
    const models = nodes.filter((n) => n.type === 'data_model');
    expect(models.length).toBe(2);
    expect(models.some((m) => m.label === 'Post')).toBe(true);
    expect(models.some((m) => m.label === 'User')).toBe(true);
  });

  it('NEVER makes a test/config/story file into a node', () => {
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes } = buildNodes({
      fileTree: [
        'app/page.tsx',
        'components/Button.tsx',
        'components/Button.stories.tsx',
        'components/narrative.test.tsx',
        'next.config.js',
        '__tests__/helper.tsx',
      ],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    const labels = nodes.map((n) => n.label);
    expect(labels).not.toContain('narrative');
    expect(labels).not.toContain('Button.stories');
    expect(labels.some((l) => l.includes('test'))).toBe(false);
    // The real Button component still becomes a node.
    expect(nodes.some((n) => n.type === 'component' && n.label === 'Button')).toBe(true);
  });

  it('detects an auth_guard node from middleware.ts', () => {
    const routeInventory = inv([PAGE('/', 'app/page.tsx')]);
    const { nodes } = buildNodes({
      fileTree: ['app/page.tsx', 'middleware.ts'],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    expect(nodes.some((n) => n.type === 'auth_guard')).toBe(true);
  });

  it('de-dupes nodes by id', () => {
    const routeInventory = inv([
      PAGE('/dashboard', 'app/dashboard/page.tsx'),
      PAGE('/dashboard', 'app/dashboard/page.tsx'),
    ]);
    const { nodes } = buildNodes({
      fileTree: ['app/dashboard/page.tsx'],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    expect(nodes.filter((n) => n.type === 'page').length).toBe(1);
  });

  it('exposes a sourceFile map for page/api/action/component nodes (used by edge extraction)', () => {
    const routeInventory = inv([
      PAGE('/dashboard', 'app/dashboard/page.tsx'),
      API('/api/posts', 'app/api/posts/route.ts'),
    ]);
    const { sourceByNodeId } = buildNodes({
      fileTree: [
        'app/dashboard/page.tsx',
        'app/api/posts/route.ts',
        'components/Button.tsx',
      ],
      routeInventory,
      dataModelInventory: { tech: 'none', entities: [], sourceFiles: [], confidence: 'high' },
    });
    const entries = Object.values(sourceByNodeId);
    expect(entries).toContain('app/dashboard/page.tsx');
    expect(entries).toContain('app/api/posts/route.ts');
    expect(entries).toContain('components/Button.tsx');
  });
});
