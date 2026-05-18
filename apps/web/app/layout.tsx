import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { t, getLocale } from '@/lib/i18n';
import { Header } from '@/components/common/header';
import { Footer } from '@/components/common/footer';

// NOTE (L-P1-5 follow-up): `export const metadata` evaluates at build time so
// `t()` here always resolves to the default (ko) locale. LangToggle does NOT
// update <title> / OG tags at runtime. To make <head> locale-reactive,
// migrate to `export async function generateMetadata()` and call
// `getLocale()` per request. Deferred to Wave 3 to keep Batch A scope small.
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
  // T2.11 #122: notch/edge-to-edge 디스플레이에서 콘텐츠가 안전영역을 직접
  // 제어할 수 있도록 cover. globals.css의 .safe-area-* 유틸과 짝을 이룬다.
  viewportFit: 'cover',
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
  const locale = await getLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="bg-mk-bg text-mk-fg font-display antialiased">
        <a href="#main-content" className="skip-link">
          {t('common.skipToMain', locale)}
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
