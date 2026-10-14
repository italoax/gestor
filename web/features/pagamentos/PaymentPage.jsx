import { loadSitePage } from '../../lib/siteBackend.js';
import { PaymentScreen } from './PaymentScreen.jsx';
export async function PaymentPage() {
  return <PaymentScreen data={await loadSitePage()} />;
}
