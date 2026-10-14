import Script from 'next/script';
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

export default async function RootLayout({ children }) {
  const request = await headers();
  const path = (request.get('x-gestor-page-url') || '/').split('?')[0];
  const bodyClass =
    path === '/'
      ? 'site-effects'
      : path === '/login' || path === '/register'
        ? 'login-page'
        : path.startsWith('/area-cliente') || /^\/(pagar|p)\//.test(path)
          ? ''
          : 'page-app';
  return (
    <html lang="pt-br" suppressHydrationWarning>
      <body className={bodyClass}>
        <Script id="restore-theme" strategy="beforeInteractive">
          {
            'try{if(localStorage.getItem("gestor-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}'
          }
        </Script>
        {children}
      </body>
    </html>
  );
}
