import { loadSitePage } from '../../lib/siteBackend.js';
import { MessagesScreen } from '../../features/mensagens/MessagesScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mensagens | Gestor' };
export default async function Page() {
  return <MessagesScreen data={await loadSitePage()} />;
}
