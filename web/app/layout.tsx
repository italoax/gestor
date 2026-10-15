import { headers } from 'next/headers';

export const metadata = {
  title: 'Gestor',
  robots: { index: false, follow: false },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'ixstreaming',
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
        <script
          id="restore-theme"
          nonce={request.get('x-nonce') || undefined}
          dangerouslySetInnerHTML={{
            __html:
              'try{if(localStorage.getItem("gestor-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
