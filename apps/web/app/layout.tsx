import { headers } from 'next/headers';
import Script from 'next/script';
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
      <body className={bodyClass}>
        <Script
          id="restore-theme"
          strategy="beforeInteractive"
          nonce={request.get('x-nonce') || undefined}
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("gestor-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}',
          }}
        />
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
