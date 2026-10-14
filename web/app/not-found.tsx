import { PanelStyles } from '../components/layout/PanelStyles.tsx';

export default function NotFound() {
  return (
    <main className="container">
      <PanelStyles />
      <h1>Página ou link indisponível</h1>
      <p>
        Confira o endereço. Se for um link de acesso ou pagamento, solicite um
        novo link ao responsável.
      </p>
      <a className="btn btn-primary" href="/">
        Ir para o início
      </a>
    </main>
  );
}
