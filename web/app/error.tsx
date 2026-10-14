'use client';
import { PanelStyles } from '../components/layout/PanelStyles.tsx';
export default function ErrorPage() {
  return (
    <main className="container">
      <PanelStyles />
      <h1>Não foi possível carregar a página</h1>
      <p>Tente novamente em alguns instantes.</p>
      <button className="btn btn-primary" onClick={() => location.reload()}>
        Tentar novamente
      </button>
    </main>
  );
}
