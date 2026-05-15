import type { Step } from './index.js';

const GITHUB_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/i;

export const step01ValidateInput: Step = {
  step: 'VALIDATE_INPUT',
  async execute(ctx) {
    if (!GITHUB_RE.test(ctx.repoUrl)) {
      throw new Error(`잘못된 GitHub Repo URL: ${ctx.repoUrl}`);
    }
    if (ctx.deployUrl) {
      try {
        const u = new URL(ctx.deployUrl);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') {
          throw new Error(`지원하지 않는 배포 URL 프로토콜: ${u.protocol}`);
        }
      } catch {
        throw new Error(`잘못된 배포 URL: ${ctx.deployUrl}`);
      }
    }
    ctx.log('info', 'Input validated', { repoUrl: ctx.repoUrl });
  },
};
