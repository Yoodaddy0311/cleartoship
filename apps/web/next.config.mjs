/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cleartoship/ui', '@cleartoship/shared-types', '@cleartoship/audit-core'],
  // Keep Google Cloud + Firebase Admin SDKs as external `require()` calls in
  // the server bundle. Webpack otherwise inlines them and bakes the build-time
  // absolute pnpm-isolated path (e.g.
  //   /app/node_modules/.pnpm/@google-cloud+tasks@5.5.2/node_modules/
  //   @google-cloud/tasks/build/esm/src/v2/cloud_tasks_client_config.json)
  // into the chunk. That path no longer resolves when the runtime image runs
  // `pnpm install --prod` fresh, and POST /api/audit-runs crashes with
  // MODULE_NOT_FOUND on the *_client_config.json dynamic require. Listing
  // them here forces Next.js to leave them as `require('@google-cloud/tasks')`
  // so plain Node.js CJS resolution kicks in at runtime.
  serverExternalPackages: [
    '@google-cloud/tasks',
    '@google-cloud/monitoring',
    '@google-cloud/firestore',
    '@google-cloud/storage',
    'firebase-admin',
    'google-gax',
    'google-auth-library',
    'protobufjs',
    'grpc-js',
    '@grpc/grpc-js',
    '@grpc/proto-loader',
  ],
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
