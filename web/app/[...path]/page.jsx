import { loadSitePage } from '../../lib/siteBackend.js';
import { SitePageControllers } from '../../components/legacy/SitePageControllers.jsx';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const page = await loadSitePage();
  const commercial = page.path === '/';
  return {
    title: page.title,
    description: page.description,
    robots: { index: commercial, follow: commercial },
    alternates: page.canonical ? { canonical: page.canonical } : undefined,
    openGraph: commercial ? page.openGraph : undefined,
    twitter: commercial ? page.twitter : undefined,
    appleWebApp: {
      capable: true,
      title: page.appleWebAppTitle || 'ixstreaming',
      statusBarStyle: 'black-translucent',
    },
  };
}

export async function generateViewport() {
  const page = await loadSitePage();
  return { themeColor: page.themeColor || '#6366f1' };
}

export default async function SitePage() {
  const page = await loadSitePage();
  return (
    <>
      {page.head}
      {page.content}
      <SitePageControllers
        scripts={page.scripts}
        bodyAttributes={page.bodyAttributes}
        path={page.path}
      />
    </>
  );
}
