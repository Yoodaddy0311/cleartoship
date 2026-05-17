// Tests for the ANALYZE_PROJECT_STRUCTURE pipeline step.
//
// Strategy:
//   - Create a real temp directory per test, drop the appropriate manifest
//     fixtures (package.json / pyproject.toml / etc.), and run the step.
//   - Verify (a) FrameworkProfile.primary is correctly identified, (b)
//     secondary deps surface in the profile, (c) state.techStack is rebuilt
//     for backwards compatibility with the report header.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import { step04AnalyzeProjectStructure } from './04-analyze-project-structure.js';
import { createInitialState, type PipelineState } from './index.js';

async function makeFixture(): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'ct-step04-'));
}

async function writePkg(root: string, pkg: object): Promise<void> {
  await fsp.writeFile(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2), 'utf8');
}

async function writeFile(root: string, rel: string, body = ''): Promise<void> {
  const abs = path.join(root, rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, body, 'utf8');
}

async function mkSubdir(root: string, rel: string): Promise<void> {
  await fsp.mkdir(path.join(root, rel), { recursive: true });
}

function makeCtx(clonePath: string | null): WorkerCtx {
  return {
    runId: 'run-step04',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText: null,
    clonePath,
    log: vi.fn(),
  };
}

describe('step04AnalyzeProjectStructure - framework detection', () => {
  const fixtures: string[] = [];

  beforeEach(() => {
    fixtures.length = 0;
  });

  afterEach(async () => {
    for (const dir of fixtures) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  async function setup(): Promise<{ dir: string; state: PipelineState }> {
    const dir = await makeFixture();
    fixtures.push(dir);
    return { dir, state: createInitialState() };
  }

  it('detects Next.js (App Router) from package.json + app/', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, {
      dependencies: { next: '14.0.0', react: '18.0.0' },
      devDependencies: { typescript: '5.0.0', tailwindcss: '3.4.0' },
    });
    await mkSubdir(dir, 'app');
    await writeFile(dir, 'tsconfig.json', '{}');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('nextjs-app');
    expect(state.frameworkProfile?.language).toBe('typescript');
    expect(state.frameworkProfile?.secondary).toContain('Tailwind CSS');
    expect(state.techStack).toContain('Next.js (App Router)');
    expect(state.techStack).toContain('Tailwind CSS');
  });

  it('detects Next.js (Pages Router) from package.json + pages/', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { next: '13.0.0', react: '18.0.0' } });
    await mkSubdir(dir, 'pages');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('nextjs-pages');
  });

  it('detects Vite + React', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, {
      dependencies: { react: '18.0.0', 'react-dom': '18.0.0' },
      devDependencies: { vite: '5.0.0', '@vitejs/plugin-react': '4.0.0' },
    });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('vite-react');
    expect(state.techStack).toContain('Vite + React');
  });

  it('detects Vite + Vue', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, {
      dependencies: { vue: '3.4.0' },
      devDependencies: { vite: '5.0.0', '@vitejs/plugin-vue': '5.0.0' },
    });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('vite-vue');
  });

  it('detects SvelteKit', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { devDependencies: { '@sveltejs/kit': '2.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('sveltekit');
  });

  it('detects Remix', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, {
      dependencies: { '@remix-run/react': '2.0.0', '@remix-run/node': '2.0.0' },
    });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('remix');
  });

  it('detects Astro', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { astro: '4.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('astro');
  });

  it('detects Electron', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { devDependencies: { electron: '28.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('electron');
  });

  it('detects React Native (no expo)', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { 'react-native': '0.73.0', react: '18.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('react-native');
  });

  it('detects Expo over react-native when both present', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, {
      dependencies: { expo: '50.0.0', 'react-native': '0.73.0', react: '18.0.0' },
    });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('expo');
  });

  it('detects Express', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { express: '4.19.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('express');
  });

  it('detects Fastify', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { fastify: '4.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('fastify');
  });

  it('detects NestJS', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { '@nestjs/core': '10.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('nest');
  });

  it('detects FastAPI from requirements.txt', async () => {
    const { dir, state } = await setup();
    await writeFile(dir, 'requirements.txt', 'fastapi==0.110.0\nuvicorn==0.29.0\n');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('fastapi');
    expect(state.frameworkProfile?.language).toBe('python');
    expect(state.techStack).toContain('FastAPI');
    expect(state.techStack).toContain('Python');
  });

  it('detects Django from pyproject.toml', async () => {
    const { dir, state } = await setup();
    await writeFile(
      dir,
      'pyproject.toml',
      '[project]\nname="demo"\ndependencies=["django>=5.0"]\n'
    );

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('django');
  });

  it('detects Flask from requirements.txt', async () => {
    const { dir, state } = await setup();
    await writeFile(dir, 'requirements.txt', 'flask==3.0.0\n');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('flask');
  });

  it('returns unknown when no manifest is present', async () => {
    const { dir, state } = await setup();
    await writeFile(dir, 'README.md', '# nothing here');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('unknown');
    expect(state.frameworkProfile?.language).toBe('unknown');
    expect(state.techStack).toEqual([]);
  });

  it('handles malformed package.json gracefully', async () => {
    const { dir, state } = await setup();
    await fsp.writeFile(path.join(dir, 'package.json'), '{ not valid json', 'utf8');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('unknown');
  });

  it('falls back to next.config.* when next dep is missing', async () => {
    const { dir, state } = await setup();
    await writeFile(dir, 'next.config.mjs', 'export default {};');
    await mkSubdir(dir, 'app');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.primary).toBe('nextjs-app');
  });

  it('sets techStack=[] and frameworkProfile=unknown when clonePath is null', async () => {
    const state = createInitialState();
    await step04AnalyzeProjectStructure.execute(makeCtx(null), state);
    expect(state.frameworkProfile?.primary).toBe('unknown');
    expect(state.techStack).toEqual([]);
  });

  it('collects multiple secondary deps (Prisma, Tailwind, Zod, tRPC)', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, {
      dependencies: {
        next: '14.0.0',
        react: '18.0.0',
        '@prisma/client': '5.0.0',
        zod: '3.22.0',
        '@trpc/server': '10.0.0',
      },
      devDependencies: { tailwindcss: '3.4.0', prisma: '5.0.0' },
    });
    await mkSubdir(dir, 'app');

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    const sec = state.frameworkProfile?.secondary ?? [];
    expect(sec).toContain('Prisma');
    expect(sec).toContain('Tailwind CSS');
    expect(sec).toContain('Zod');
    expect(sec).toContain('tRPC');
  });

  it('records evidence entries for the primary detection signal', async () => {
    const { dir, state } = await setup();
    await writePkg(dir, { dependencies: { fastify: '4.0.0' } });

    await step04AnalyzeProjectStructure.execute(makeCtx(dir), state);

    expect(state.frameworkProfile?.evidence.length).toBeGreaterThan(0);
    const ev = state.frameworkProfile!.evidence[0]!;
    expect(ev.file).toBe('package.json');
    expect(ev.signal.toLowerCase()).toContain('fastify');
  });
});
