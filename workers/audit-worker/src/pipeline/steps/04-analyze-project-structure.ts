import type { Step } from './index.js';

/**
 * Works on the (mock) file tree to infer tech stack. Pure heuristics — no I/O.
 */
export const step04AnalyzeProjectStructure: Step = {
  step: 'ANALYZE_PROJECT_STRUCTURE',
  async execute(ctx, state) {
    const tree = state.fileTree;
    const stack = new Set<string>();
    if (tree.some((p) => p.endsWith('next.config.mjs') || p.endsWith('next.config.js'))) {
      stack.add('Next.js');
    }
    if (tree.some((p) => p === 'package.json')) stack.add('Node.js');
    if (tree.some((p) => p.endsWith('tsconfig.json'))) stack.add('TypeScript');
    if (tree.some((p) => p === 'prisma/schema.prisma')) stack.add('Prisma');
    if (tree.some((p) => p.startsWith('app/api/'))) stack.add('Next.js Route Handlers');
    if (tree.some((p) => p.endsWith('.tsx') || p.endsWith('.jsx'))) stack.add('React');
    if (tree.some((p) => p === 'firebase.json' || p === '.firebaserc')) stack.add('Firebase');
    if (tree.some((p) => p.endsWith('tailwind.config.ts') || p.endsWith('tailwind.config.js'))) {
      stack.add('Tailwind CSS');
    }
    state.techStack = [...stack];
    ctx.log('info', 'Project structure analyzed', { techStack: state.techStack });
  },
};
