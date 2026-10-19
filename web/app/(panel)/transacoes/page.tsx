import { loadSitePage } from '../../../lib/siteBackend.ts';
import { TransactionsScreen } from '../../../features/transacoes/TransactionsScreen.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Transações | Gestor' };
export default async function Page() {
  return <TransactionsScreen data={await loadSitePage()} />;
}
