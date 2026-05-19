import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for the web-ssr Cloud Run image. Produces
  // .next/standalone/server.js with required node_modules inlined, so the
  // runtime Docker stage does not need to run `pnpm install --prod`.
  output: 'standalone',
  // Trace from the monorepo root so workspace siblings (packages/*) are
  // picked up by the standalone bundle.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ['@cleartoship/ui', '@cleartoship/shared-types', '@cleartoship/audit-core'],
  typedRoutes: false,
  webpack: (config) => {
    // Workspace packages export `src/*.ts` directly and use `./foo.js` barrel
    // imports for NodeNext compatibility with the audit-worker/functions
    // builds. Webpack needs `extensionAlias` so the literal `.js` request
    // resolves to the `.ts` source on disk.
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
