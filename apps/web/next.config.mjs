/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
