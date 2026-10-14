'use client';
import { useState } from 'react';
import { paymentProviders } from '../../../src/frontend/paymentProviders.js';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.jsx';
import { NativePanel } from '../../components/layout/NativePanel.jsx';
import { NativeDialog } from '../../components/ui/NativeDialog.jsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.js';

function SettingsForm({ token, action, children }) {
  const submit = useNativeSubmit();
  return (
    <form method="post" action="/integracao-pagamento" onSubmit={submit}>
      <CsrfInput token={token} />
      <input type="hidden" name="action" value={action} />
      {children}
    </form>
  );
}
function ProviderEditor({ provider, token, appUrl, onClose }) {
  const info = paymentProviders[provider.id],
    submit = useNativeSubmit();
  return (
    <NativeDialog
      title={provider.nome}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="react-payment-provider-form"
          >
            Salvar
          </button>
        </>
      }
    >
      <form
        method="post"
        action="/integracao-pagamento"
        className="modal-body"
        id="react-payment-provider-form"
        autoComplete="off"
        onSubmit={submit}
      >
        <CsrfInput token={token} />
        <input type="hidden" name="provider" value={provider.id} />
        <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
          {info.help}
        </p>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Webhook a configurar no painel do provedor:{' '}
          <code style={{ overflowWrap: 'anywhere' }}>
            {appUrl + '/webhook/' + provider.id}
          </code>
        </p>
        <div className="form-grid">
          {info.fields.map(([name, label, placeholder]) => (
            <label className="field full" key={name}>
              <span>{label}</span>
              {name === 'ambiente' ? (
                <select
                  className="input"
                  name={`creds_${provider.id}_${name}`}
                  defaultValue={provider.credentials[name] || 'producao'}
                >
                  <option value="producao">Produção</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              ) : (
                <input
                  className="input"
                  type="password"
                  name={`creds_${provider.id}_${name}`}
                  defaultValue={provider.credentials[name] || ''}
                  placeholder={placeholder || ''}
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                />
              )}
            </label>
          ))}
          <label className="switch-field full">
            <span>
              <strong>Ativar este provedor</strong>
              <small>
                Quando ativo, vira opção pra ser usado nos links de pagamento.
              </small>
            </span>
            <input
              type="checkbox"
              name={`ativo_${provider.id}`}
              value="1"
              className="switch"
              defaultChecked={provider.ativo}
            />
          </label>
        </div>
      </form>
    </NativeDialog>
  );
}
export function PaymentSettingsScreen({ data }) {
  const [editor, setEditor] = useState(null);
  const active = data.providers.filter((provider) => provider.ativo);
  return (
    <NativePanel data={data} path="/integracao-pagamento">
      <div
        className="container page-integracao-pag"
        data-react-page="integracao-pagamento"
      >
        <div className="ui-settings-grid">
          <section className="card ui-settings-card">
            <h2>Receber pagamentos por QR Code PIX</h2>
            <p>
              Conecte sua conta de pagamento para gerar QR Code e PIX Copia e
              Cola nos links dos clientes.
            </p>
            <ol>
              <li>
                Escolha um provedor abaixo, informe a credencial e ative a
                integração.
              </li>
              <li>Selecione a conta que receberá os pagamentos.</li>
              <li>
                Envie <code>{'{link_cliente}'}</code> na mensagem. O cliente
                abre o link e gera o PIX.
              </li>
            </ol>
            <SettingsForm token={data.page.csrfToken} action="provedor-padrao">
              <label className="field">
                Receber PIX por
                <select
                  className="input"
                  name="provider"
                  required
                  defaultValue={
                    active.some(
                      (provider) => provider.id === data.providerPadrao,
                    )
                      ? data.providerPadrao
                      : ''
                  }
                >
                  <option value="">Escolha uma conta ativa</option>
                  {active.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.nome}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Uma chave PIX simples não habilita a confirmação automática.
                Informe a credencial da integração. Salvar a configuração não
                gera cobrança nem valida a credencial junto ao provedor.
              </p>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={!active.length}
              >
                Salvar conta de recebimento
              </button>
            </SettingsForm>
          </section>
          <section className="card ui-settings-card">
            <h2>Mensagem após confirmação do PIX</h2>
            <p>
              Escolha a mensagem enviada ao WhatsApp do cliente quando o
              provedor confirmar o pagamento, inclusive quando a renovação for
              manual.
            </p>
            <SettingsForm
              token={data.page.csrfToken}
              action="mensagem-confirmacao"
            >
              <label className="field">
                Mensagem
                <select
                  className="input"
                  name="mensagem_id"
                  defaultValue={String(data.mensagemConfirmacaoId)}
                >
                  <option value="">Não enviar mensagem</option>
                  {data.mensagens.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.titulo}
                    </option>
                  ))}
                </select>
              </label>
              <p className="muted">
                Cadastre seus modelos em <a href="/mensagens">Mensagens</a>. O
                WhatsApp precisa estar conectado. Use um texto de confirmação de
                pagamento; a renovação pode ainda estar em processamento.
              </p>
              <button className="btn btn-primary" type="submit">
                Salvar mensagem
              </button>
            </SettingsForm>
          </section>
        </div>
        <div className="ui-summary ui-summary-3">
          {[
            ['Provedores PIX', data.providers.length, 'blue'],
            ['Ativos', active.length, 'green'],
            [
              'Configurados',
              data.providers.filter((provider) => provider.configurado).length,
              'blue',
            ],
          ].map(([label, value, color]) => (
            <div className={`cli-stat accent-${color}`} key={label}>
              <div className="cli-stat-ico">
                <Icon name="card" />
              </div>
              <div>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="int-pag-intro">
          <span className="int-pag-intro-ico">💡</span>
          <div>
            <strong>Como usar</strong>
            <p>
              Ative pelo menos um provedor PIX abaixo. Depois, insira a tag{' '}
              <code>{'{link_cliente}'}</code> em qualquer template de mensagem —
              o gestor troca pelo link de pagamento do cliente automaticamente
              ao enviar.
            </p>
          </div>
        </div>
        <h3 className="int-pag-titulo">Formas de pagamento</h3>
        <div className="int-pag-grid">
          {data.providers.map((provider) => (
            <div
              key={provider.id}
              className={`int-pag-card ${provider.ativo ? 'is-active' : ''}`}
              style={{ '--card-accent': paymentProviders[provider.id].color }}
              data-payment-provider={provider.id}
            >
              <div className="int-pag-card-head">
                <div className="int-pag-ico">
                  <Icon name="card" />
                </div>
                <div className="int-pag-card-info">
                  <strong>{provider.nome}</strong>
                  <span
                    className={`badge ${provider.ativo ? 'badge-green' : 'badge-muted'}`}
                  >
                    {provider.ativo
                      ? 'Ativo'
                      : provider.configurado
                        ? 'Configurado'
                        : 'Inativo'}
                  </span>
                </div>
                <a
                  className="int-pag-suporte"
                  href={paymentProviders[provider.id].support}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Página do provedor"
                >
                  ↗ Suporte
                </a>
              </div>
              <div className="int-pag-card-foot">
                <span className="muted">PIX</span>
                <button
                  className={`btn ${provider.ativo ? 'btn-muted' : 'btn-primary'}`}
                  type="button"
                  onClick={() => setEditor(provider)}
                >
                  {provider.ativo ? 'Editar' : 'Ativar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      {editor && (
        <ProviderEditor
          provider={editor}
          token={data.page.csrfToken}
          appUrl={data.appUrl}
          onClose={() => setEditor(null)}
        />
      )}
    </NativePanel>
  );
}
