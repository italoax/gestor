import { loadSitePage } from '../../lib/siteBackend.js';
import { TransactionsScreen } from '../../features/transacoes/TransactionsScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Transações | Gestor' };
export default async function Page() {
  return <TransactionsScreen data={await loadSitePage()} />;
}
