'use client';
import { CsrfInput } from '../../../src/frontend/clients/ui.jsx';
import { NativePanel } from '../../components/layout/NativePanel.jsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.js';

function AccessAction({ item, action, token, children, disabled = false }) {
  const submit = useNativeSubmit();
  return (
    <form method="post" action="/acessos-clientes" onSubmit={submit}>
      <CsrfInput token={token} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="action" value={action} />
      <button className="btn btn-secondary" type="submit" disabled={disabled}>
        {children}
      </button>
    </form>
  );
}
export function ClientAccessScreen({ data }) {
  return (
    <NativePanel data={data} path="/acessos-clientes">
      <div className="container" data-react-page="acessos-clientes">
        <h1>Acessos dos clientes</h1>
        <p>
          O cliente entra com o mesmo usuário e senha do IPTV. Edite o cadastro
          do cliente para alterar esses dados.
        </p>
        <p>
          <a href="/area-cliente">Abrir área do cliente</a> ·{' '}
          <a href="/clientes">Voltar aos clientes</a>
        </p>
        {data.aviso && <p role="status">{data.aviso}</p>}
        {!data.clientes.length && (
          <div className="card">
            <p className="muted">Nenhum cliente cadastrado.</p>
          </div>
        )}
        {data.clientes.map((item) => (
          <section
            className="card"
            style={{ padding: 20 }}
            key={item.id}
            data-access-item={item.id}
          >
            <h2>{item.nome}</h2>
            <p>
              Login IPTV: {item.user} ·{' '}
              {item.blocked
                ? 'Acesso desativado'
                : item.hasPassword && item.user
                  ? 'Acesso habilitado'
                  : 'Preencha os dados IPTV no cadastro'}
            </p>
            <AccessAction
              item={item}
              token={data.page.csrfToken}
              action={item.blocked ? 'enable' : 'disable'}
            >
              {item.blocked ? 'Habilitar acesso' : 'Desativar acesso'}
            </AccessAction>
            <p className="muted">
              O link de acesso tem 16 caracteres. Revogar invalida o link
              anterior e as sessões abertas. Ao copiar ou enviar novamente, um
              novo link será gerado.
            </p>
            <AccessAction
              item={item}
              token={data.page.csrfToken}
              action="revoke-link"
              disabled={!item.hasLink}
            >
              Revogar link de acesso
            </AccessAction>
          </section>
        ))}
      </div>
    </NativePanel>
  );
}
