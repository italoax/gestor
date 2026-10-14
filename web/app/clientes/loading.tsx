import { PanelStyles } from '../../components/layout/PanelStyles.tsx';

export default function Loading() {
  return (
    <main className="container" role="status" aria-live="polite">
      <PanelStyles />
      <p>Carregando clientes…</p>
    </main>
  );
}
