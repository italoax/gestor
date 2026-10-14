import { loadSitePage } from '../../lib/siteBackend.js';
import { PaymentSettingsScreen } from '../../features/integracao-pagamento/PaymentSettingsScreen.jsx';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Integração Pagamento | Gestor' };
export default async function Page() {
  return <PaymentSettingsScreen data={await loadSitePage()} />;
}
