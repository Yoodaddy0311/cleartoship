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
  themeColor: '#FFFFFF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
