import { headers } from 'next/headers';
import { themeBootstrapSource } from '../../../src/shared/theme.ts';
import { PwaProvider } from '../components/pwa/PwaProvider.tsx';
import { publicAssetUrl } from '../lib/publicAssets.ts';

export const metadata = {
  title: 'Gestor IXTV',
  robots: { index: false, follow: false },
  manifest: '/__pwa/manifest',
  appleWebApp: {
    capable: true,
    title: 'Gestor IXTV',
    statusBarStyle: 'black-translucent',
  },
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
};
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#6366f1',
};

export default async function RootLayout({
  children,
}: {
  children?: React.ReactNode;
}) {
  const request = await headers();
  const pageUrl = new URL(
    request.get('x-gestor-page-url') || '/',
    'http://gestor.local',
  );
  const path = pageUrl.pathname;
  const bodyClass =
    path === '/'
      ? 'site-effects'
      : path === '/login' || path === '/register'
        ? 'login-page'
        : path.startsWith('/area-cliente') || /^\/(pagar|p)\//.test(path)
          ? path === '/area-cliente' &&
            pageUrl.searchParams.get('embedded') === '1'
            ? 'portal-embedded-login'
            : ''
          : 'page-app';
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <head>
        <script
          id="restore-theme"
          nonce={request.get('x-nonce') || undefined}
          dangerouslySetInnerHTML={{ __html: themeBootstrapSource }}
        />
      </head>
      <body className={bodyClass}>
        <link
          rel="stylesheet"
          href={publicAssetUrl('/assets/css/panel-feedback.css')}
          precedence="feedback"
        />
        <link
          rel="stylesheet"
          href={publicAssetUrl('/assets/css/pwa.css')}
          precedence="pwa"
        />
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
