import { loadSitePage } from '../../lib/siteBackend.js';
import { WhatsAppScreen } from '../../features/whatsapp/WhatsAppScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'WhatsApp | Gestor' };
export default async function Page() {
  return <WhatsAppScreen data={await loadSitePage()} />;
}
