// Bundles functions/src/index.ts into lib/index.js with all workspace
// dependencies (@cleartoship/*) inlined. Required because Cloud Functions
// deploys via Cloud Build, which runs `npm install` and rejects pnpm's
// `workspace:*` protocol:
//
//   npm error code EUNSUPPORTEDPROTOCOL
//   npm error Unsupported URL Type "workspace:": workspace:*
//
// External-marked packages stay as plain `dependencies` in package.json so
// npm installs them normally in the Cloud Build environment:
//   - firebase-functions, firebase-admin: have native/runtime requirements
//     and must match the Cloud Functions runtime's own copy
//   - @google-cloud/tasks: ships gRPC native bindings; bundling breaks them
//
// Everything else (workspace packages, zod, pure-JS transitives) is
// inlined into lib/index.js.

import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const libDir = resolve(root, 'lib');

// Wipe stale tsc output (lib/triggers/*.js, lib/lib/*.js, ...) so the
// Cloud Functions upload contains only the bundled entry point.
await rm(libDir, { recursive: true, force: true });

await build({
  entryPoints: [resolve(root, 'src/index.ts')],
  outfile: resolve(root, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: [
    'firebase-functions',
    'firebase-functions/*',
    'firebase-admin',
    'firebase-admin/*',
    '@google-cloud/tasks',
  ],
  sourcemap: 'inline',
  logLevel: 'info',
  legalComments: 'none',
});
