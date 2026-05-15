import type { Metadata, Viewport } from 'next';
import './globals.css';
import { t } from '@/lib/i18n';
import { Header } from '@/components/common/header';
import { Footer } from '@/components/common/footer';

export const metadata: Metadata = {
  title: t('app.title'),
  description: t('app.description'),
  applicationName: 'ClearToShip',
  authors: [{ name: 'ClearToShip' }],
  keywords: ['Vibe Coding', 'AI Auditor', 'GitHub Audit', 'Product Readiness'],
  openGraph: {
    title: t('app.title'),
    description: t('app.description'),
    type: 'website',
    locale: 'ko_KR',
  },
};

export const viewport: Viewport = {
  themeColor: '#07070B',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

/**
 * RootLayout
 * - lang="ko" for screen readers and font fallback ordering
 * - Pretendard Variable served via official CDN link (no local font file needed in Sprint 0).
 *   Replace with `next/font/local` once /public/fonts/PretendardVariable.woff2 is added.
 * - Mono fallback uses the system stack defined in globals.css `--font-mono`.
 *   Add `geist` to apps/web/package.json and re-introduce `GeistMono` if desired.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-bg-base text-fg-primary antialiased">
        <div className="relative isolate flex min-h-dvh flex-col">
          <Header />
          <main id="main-content" className="flex-1">
            {children}
          </main>
          <Footer />
        </div>
      </body>
    </html>
  );
}
