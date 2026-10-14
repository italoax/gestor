import { loadSitePage } from '../../lib/siteBackend.js';
import { AccountScreen } from '../../features/minha-conta/AccountScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Minha Conta | Gestor' };
export default async function AccountPage() {
  return <AccountScreen data={await loadSitePage()} />;
}
