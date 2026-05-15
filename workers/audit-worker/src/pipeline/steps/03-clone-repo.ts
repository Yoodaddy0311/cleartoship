// MOCK Sprint 0 — replace in Sprint 1 with `git clone --depth=1` into /tmp/clone-{runId}.

import type { Step } from './index.js';
import { setRunCommitHash } from '../../firestore/writers.js';

const MOCK_FILE_TREE: ReadonlyArray<string> = [
  'README.md',
  'package.json',
  'next.config.mjs',
  'tsconfig.json',
  'app/layout.tsx',
  'app/page.tsx',
  'app/login/page.tsx',
  'app/dashboard/page.tsx',
  'app/api/auth/route.ts',
  'app/api/projects/route.ts',
  'components/LoginForm.tsx',
  'components/ProjectCard.tsx',
  'lib/db.ts',
  'prisma/schema.prisma',
  '.env.example',
];

export const step03CloneRepo: Step = {
  step: 'CLONE_REPO',
  async execute(ctx, state) {
    // MOCK Sprint 0 — replace in Sprint 1
    state.fileTree = [...MOCK_FILE_TREE];
    await setRunCommitHash(ctx.runId, 'mock-sha-sprint0');
    ctx.log('info', 'Repo clone mocked', { fileCount: MOCK_FILE_TREE.length });
  },
};
