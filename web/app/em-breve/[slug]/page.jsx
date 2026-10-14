import { loadSitePage } from '../../../lib/siteBackend.js';
import { PlaceholderScreen } from '../../../features/em-breve/PlaceholderScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Em breve | Gestor' };
export default async function Page() {
  return <PlaceholderScreen data={await loadSitePage()} />;
}
