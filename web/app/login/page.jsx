import { loadSitePage } from '../../lib/siteBackend.js';
import { PanelStyles } from '../../components/layout/PanelStyles.jsx';
import { LoginScreen } from '../../features/login/LoginScreen.jsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Login | Gestor' };
export default async function LoginPage() {
  const data = await loadSitePage();
  return (
    <>
      <PanelStyles />
      <LoginScreen data={data} />
    </>
  );
}
