import { loadSitePage } from '../../../lib/siteBackend.ts';
import { MessagesScreen } from '../../../features/mensagens/MessagesScreen.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mensagens | Gestor' };
export default async function Page() {
  return <MessagesScreen data={await loadSitePage()} />;
}
