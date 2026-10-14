import Script from 'next/script';
import { loadSitePage } from '../lib/siteBackend.js';
import { LandingContent } from '../features/inicio/LandingContent.jsx';

export const dynamic = 'force-dynamic';
const title = 'IX Streaming | IPTV e planos de TV online';
const description =
  'Conheça a IX Streaming: planos de IPTV e TV online a partir de R$ 25 por mês. Confira aparelhos compatíveis e tire suas dúvidas pelo WhatsApp.';
export const metadata = {
  title,
  description,
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://ixstreaming.com.br/' },
  appleWebApp: {
    capable: true,
    title: 'IX TV',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    title,
    description:
      'Planos de IPTV e TV online a partir de R$ 25 por mês. Confira as opções e aparelhos compatíveis na IX Streaming.',
    url: 'https://ixstreaming.com.br/',
    siteName: 'IX Streaming',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: 'https://ixstreaming.com.br/assets/images/ixlogo.png',
        alt: 'Logo IX Streaming',
      },
    ],
  },
  twitter: { card: 'summary' },
};
export const viewport = { themeColor: '#100d14' };
const organization = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'IX Streaming',
  alternateName: 'IX TV',
  url: 'https://ixstreaming.com.br/',
  logo: 'https://ixstreaming.com.br/assets/images/ixlogo.png',
};
export default async function Page() {
  const data = await loadSitePage();
  return (
    <>
      <link rel="stylesheet" href="/assets/css/ix-streaming.css" />
      <link rel="stylesheet" href="/assets/css/visual-effects.css" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organization) }}
      />
      <LandingContent data={data} />
      <Script src="/assets/js/visual-effects.js" strategy="afterInteractive" />
    </>
  );
}
