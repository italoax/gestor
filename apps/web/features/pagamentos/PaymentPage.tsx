import { loadSitePage } from '../../lib/siteBackend.ts';
import { PaymentScreen } from './PaymentScreen.tsx';
export async function PaymentPage() {
  return <PaymentScreen data={await loadSitePage()} />;
}
