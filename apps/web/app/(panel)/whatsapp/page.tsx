import { loadSitePage } from '../../../lib/siteBackend.ts';
import { WhatsAppScreen } from '../../../features/whatsapp/WhatsAppScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'WhatsApp | Gestor IXTV' };
export default async function Page() {
  return <WhatsAppScreen data={await loadSitePage()} />;
}
