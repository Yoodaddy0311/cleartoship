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
  // Next.js' static tracing (nft) only follows ES/CJS imports — it misses
  // runtime `require('./client_config.json')` patterns used by Google Cloud
  // SDKs to load their service descriptors. Without these explicit globs the
  // standalone runtime crashes the first time CloudTasksClient (or any
  // sibling SDK) is instantiated:
  //   MODULE_NOT_FOUND … @google-cloud/tasks/build/esm/src/v2/cloud_tasks_client_config.json
  // We include both the pnpm-isolated layout (.pnpm/<pkg>@<ver>/…) and the
  // hypothetical hoisted layout so the same config keeps working under
  // future package-manager changes.
  outputFileTracingIncludes: {
    '*': [
      // @google-cloud/* SDKs: client_config.json, gapic_metadata.json, and
      // .proto/protos.json gRPC descriptors loaded via runtime require.
      '../../node_modules/.pnpm/@google-cloud+*/node_modules/@google-cloud/**/build/**/*.json',
      '../../node_modules/.pnpm/@google-cloud+*/node_modules/@google-cloud/**/build/**/*.proto',
      // google-gax: shared protobuf descriptors used by every Google SDK.
      '../../node_modules/.pnpm/google-gax*/node_modules/google-gax/build/**/*.json',
      '../../node_modules/.pnpm/google-gax*/node_modules/google-gax/build/**/*.proto',
      // firebase-admin: bundles its own proto descriptors for the Realtime
      // Database / Firestore transports.
      '../../node_modules/.pnpm/firebase-admin*/node_modules/firebase-admin/**/*.json',
      // Non-pnpm fallback paths in case the layout changes.
      '../../node_modules/@google-cloud/**/build/**/*.json',
      '../../node_modules/@google-cloud/**/build/**/*.proto',
      '../../node_modules/google-gax/build/**/*.json',
      '../../node_modules/google-gax/build/**/*.proto',
      '../../node_modules/firebase-admin/**/*.json',
    ],
  },
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
