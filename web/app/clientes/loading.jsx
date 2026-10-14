import { PanelStyles } from '../../components/layout/PanelStyles.jsx';

export default function Loading() {
  return (
    <main className="container" role="status" aria-live="polite">
      <PanelStyles />
      <p>Carregando clientes…</p>
    </main>
  );
}
