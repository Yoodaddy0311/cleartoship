import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
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
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Reading the per-request `x-nonce` header set by `middleware.ts` opts the root
  // layout into dynamic rendering (a per-request nonce cannot be statically cached)
  // and, more importantly, tells Next.js 15+ to attach this nonce to every framework
  // bootstrap <script> it emits. We deliberately do NOT echo the nonce into a DOM
  // attribute — that would let an attacker who can inject markup recover it and bypass
  // CSP. Any future `<Script>` tag we add should pass `nonce={nonce}` explicitly.
  // See: https://nextjs.org/docs/app/building-your-application/configuring/content-security-policy
  void (await headers()).get('x-nonce');
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="bg-mk-bg text-mk-fg font-display antialiased">
        <a href="#main-content" className="skip-link">
          {t('common.skipToMain')}
        </a>
        <div className="relative flex min-h-dvh flex-col">
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
