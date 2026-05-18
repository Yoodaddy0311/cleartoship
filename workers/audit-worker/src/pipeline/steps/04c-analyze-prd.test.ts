// T2.1 / W2-C — tests for step 04c ANALYZE_PRD.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { WorkerCtx } from '../../adapters/index.js';
import { step04cAnalyzePrd } from './04c-analyze-prd.js';
import { createInitialState, type PipelineState } from './index.js';

async function makeFixture(): Promise<string> {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'ct-step04c-'));
}

async function writeFile(root: string, rel: string, body: string): Promise<void> {
  const abs = path.join(root, rel);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, body, 'utf8');
}

function makeCtx(clonePath: string | null, prdText: string | null = null): WorkerCtx {
  return {
    runId: 'run-04c',
    projectId: 'proj-1',
    ownerId: 'owner-1',
    repoUrl: 'https://github.com/example/repo',
    deployUrl: null,
    prdText,
    profileId: null,
    clonePath,
    log: vi.fn(),
  };
}

describe('step04cAnalyzePrd', () => {
  const fixtures: string[] = [];

  beforeEach(() => {
    fixtures.length = 0;
  });

  afterEach(async () => {
    for (const dir of fixtures) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  it('step.step is ANALYZE_PRD', () => {
    expect(step04cAnalyzePrd.step).toBe('ANALYZE_PRD');
  });

  it('without clonePath: prdAnalysis stays null and logs a warn', async () => {
    const ctx = makeCtx(null);
    const state: PipelineState = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.prdAnalysis).toBeNull();
  });

  it('README.md "MVP" → state.prdAnalysis.mvpClaimed = true', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', '# Project\n\nThis is an MVP for testing.');
    const ctx = makeCtx(root);
    const state: PipelineState = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.prdAnalysis).not.toBeNull();
    expect(state.prdAnalysis!.mvpClaimed).toBe(true);
    expect(state.prdAnalysis!.sources).toContain('README.md');
  });

  it('docs/PRD.md "출시 준비" → productionClaimed', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'docs/PRD.md', '# PRD\n\n이 제품은 출시 준비를 마쳤습니다.');
    const ctx = makeCtx(root);
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.prdAnalysis!.productionClaimed).toBe(true);
    expect(state.prdAnalysis!.sources).toContain('docs/PRD.md');
  });

  it('CHANGELOG.md "Beta" + README "MVP" → both flags set (merged)', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', 'MVP build.');
    await writeFile(root, 'CHANGELOG.md', 'v0.2.0 — Beta release.');
    const ctx = makeCtx(root);
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.prdAnalysis!.mvpClaimed).toBe(true);
    expect(state.prdAnalysis!.betaClaimed).toBe(true);
    expect(state.prdAnalysis!.sources).toEqual(
      expect.arrayContaining(['README.md', 'CHANGELOG.md']),
    );
  });

  it('no doc files present → empty analysis (all false, sources [])', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    const ctx = makeCtx(root);
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.prdAnalysis).not.toBeNull();
    expect(state.prdAnalysis!.mvpClaimed).toBe(false);
    expect(state.prdAnalysis!.betaClaimed).toBe(false);
    expect(state.prdAnalysis!.productionClaimed).toBe(false);
    expect(state.prdAnalysis!.sources).toEqual([]);
  });

  it('package.json description "production-ready library" → productionClaimed', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await fsp.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({ name: 'demo', description: 'A production-ready library.' }, null, 2),
      'utf8',
    );
    const ctx = makeCtx(root);
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.prdAnalysis!.productionClaimed).toBe(true);
    expect(state.prdAnalysis!.sources).toContain('package.json');
  });

  it('executedSteps records ANALYZE_PRD when step runs end-to-end', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    await writeFile(root, 'README.md', 'mvp');
    const ctx = makeCtx(root);
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.executedSteps).toContain('ANALYZE_PRD');
  });

  it('does NOT push ANALYZE_PRD into executedSteps when clonePath is null', async () => {
    const ctx = makeCtx(null);
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);
    expect(state.executedSteps).not.toContain('ANALYZE_PRD');
  });

  // W2-A: 사용자 업로드 PRD(ctx.prdText) 가 분석에 병합되어야 한다.
  // - sources 에 'user-prd-upload' 가 포함 (AC5 의 정확한 sentinel).
  // - 파일시스템 후보(README 등) 와 동시 병합.
  // - 사용자 PRD 의 키워드가 mvp/beta/production 플래그를 set 한다.
  it('merges user-uploaded PRD text (ctx.prdText) alongside filesystem docs', async () => {
    const root = await makeFixture();
    fixtures.push(root);
    // README 는 mvp 키워드만 매칭 — productionClaimed 는 오직 user-prd-upload
    // 의 'production-ready' 에서만 와야 한다 (병합 동작 검증).
    await writeFile(root, 'README.md', '# Project\n\nThis is an MVP build.');
    const ctx = makeCtx(root, '이번 출시는 production-ready 수준으로 완성되었습니다.');
    const state = createInitialState();
    await step04cAnalyzePrd.execute(ctx, state);

    expect(state.prdAnalysis).not.toBeNull();
    // 파일시스템 후보 + 사용자 PRD 가 동시에 sources 배열에 들어가야 한다.
    expect(state.prdAnalysis!.sources).toEqual(
      expect.arrayContaining(['README.md', 'user-prd-upload']),
    );
    // user-prd-upload 본문이 production 키워드를 포함하므로 플래그가 set 되어야 한다.
    expect(state.prdAnalysis!.productionClaimed).toBe(true);
  });
});
