'use client';
import { PanelStyles } from '../../components/layout/PanelStyles.jsx';
export default function ClientsError({ reset }) {
  return (
    <main className="container">
      <PanelStyles />
      <section className="card">
        <h1>Não foi possível carregar os clientes</h1>
        <p>Tente novamente em alguns instantes.</p>
        <button className="btn btn-primary" onClick={reset}>
          Tentar novamente
        </button>
        <a className="btn btn-muted" href="/dashboard">
          Voltar ao painel
        </a>
      </section>
    </main>
  );
}
