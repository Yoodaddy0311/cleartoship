// Strips `workspace:*` workspace deps from apps/web/package.json so that
// Firebase Hosting's webframeworks integration (which runs `npm install`
// against the apps/web tree to build the Next.js SSR Cloud Function) does
// not crash on the workspace protocol:
//
//   npm ERR! code EUNSUPPORTEDPROTOCOL
//   npm ERR! Unsupported URL Type "workspace:": workspace:*
//
// This is safe ONLY when run AFTER `pnpm build`, because Next.js'
// `transpilePackages` (declared in apps/web/next.config.mjs) inlines the
// workspace packages' source into `.next/server/*` at build time. The
// deployed SSR runtime therefore never resolves @cleartoship/* via
// node_modules — the bundled code is already in the .next output.
//
// The script writes a sentinel JSON comment via the `_strippedAt` field
// so a later audit can tell that the package.json was rewritten in CI.
//
// Idempotent: re-running it on an already-stripped package.json is a no-op
// other than refreshing `_strippedAt`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const webPkgPath = resolve(root, 'apps/web/package.json');

const STRIP = [
  '@cleartoship/audit-core',
  '@cleartoship/shared-types',
  '@cleartoship/ui',
];

const raw = readFileSync(webPkgPath, 'utf8');
const pkg = JSON.parse(raw);

let stripped = 0;
for (const name of STRIP) {
  if (pkg.dependencies && name in pkg.dependencies) {
    delete pkg.dependencies[name];
    stripped++;
  }
}

pkg._strippedAt = new Date().toISOString();

writeFileSync(webPkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(
  `[strip-web-workspace-deps] stripped ${stripped}/${STRIP.length} workspace dep(s) from apps/web/package.json`,
);
