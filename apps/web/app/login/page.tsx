import { loadSitePage } from '../../lib/siteBackend.ts';
import { PanelStyles } from '../../components/layout/PanelStyles.tsx';
import { LoginScreen } from '../../features/login/LoginScreen.tsx';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Login | Gestor IXTV' };
export default async function LoginPage() {
  const data = await loadSitePage();
  return (
    <>
      <PanelStyles />
      <LoginScreen data={data} />
    </>
  );
}
