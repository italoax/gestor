import { loadSitePage } from '../../../lib/siteBackend.ts';
import { PaymentSettingsScreen } from '../../../features/integracao-pagamento/PaymentSettingsScreen.tsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integração Pagamento | Gestor' };
export default async function Page() {
  return <PaymentSettingsScreen data={await loadSitePage()} />;
}
