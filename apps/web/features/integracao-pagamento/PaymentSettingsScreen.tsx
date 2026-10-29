'use client';
import { useState } from 'react';
import { paymentProviders } from '../../../../src/frontend/paymentProviders.ts';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { NativeDialog } from '../../components/ui/NativeDialog.tsx';
import {
  PaymentAuthorization,
  useAuthorizedPaymentSubmit,
} from './PaymentAuthorization.tsx';

function SettingsForm({
  token,
  action,
  children,
}: {
  token?: string;
  action?: string;
  children?: React.ReactNode;
}) {
  const submit = useAuthorizedPaymentSubmit();
  return (
    <form method="post" action="/integracao-pagamento" onSubmit={submit}>
      <CsrfInput token={token} />
      <input type="hidden" name="action" value={action} />
      {children}
    </form>
  );
}
function ProviderEditor({
  provider,
  token,
  appUrl,
  onClose,
}: {
  provider?: any;
  token?: string;
  appUrl?: any;
  onClose?: (...args: any[]) => any;
}) {
  const info = paymentProviders[provider.id],
    submit = useAuthorizedPaymentSubmit();
  return (
    <NativeDialog
      title={
        <span className="payment-provider-title">
          <img src={info.icon} alt="" width="28" height="28" />
          {provider.nome}
        </span>
      }
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
                  defaultValue={provider.credentials?.[name] || 'producao'}
                >
                  <option value="producao">Produção</option>
                  <option value="sandbox">Sandbox</option>
                </select>
              ) : name.endsWith('_pem') ? (
                <textarea
                  className="input payment-certificate"
                  name={`creds_${provider.id}_${name}`}
                  rows={4}
                  defaultValue=""
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    provider.configuredFields?.[name]
                      ? 'Configurado. Em branco mantém o atual.'
                      : placeholder || ''
                  }
                />
              ) : (
                <input
                  className="input"
                  type="password"
                  name={`creds_${provider.id}_${name}`}
                  defaultValue=""
                  placeholder={
                    provider.configuredFields?.[name]
                      ? 'Configurada. Em branco mantém a atual.'
                      : placeholder || ''
                  }
                  autoComplete="off"
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-bwignore="true"
                />
              )}
            </label>
          ))}
          {provider.configurado && (
            <label className="field full">
              <span>
                <input type="checkbox" name="remover_credenciais" value="1" />{' '}
                Remover credenciais salvas
              </span>
            </label>
          )}
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
export function PaymentSettingsScreen({ data }: { data?: any }) {
  const [editor, setEditor] = useState(null);
  const active = data.providers.filter((provider) => provider.ativo);
  return (
    <PaymentAuthorization token={data.page.csrfToken}>
      <NativePanel data={data} path="/integracao-pagamento">
        <div
          className="container page-integracao-pag"
          data-react-page="integracao-pagamento"
        >
          <div className="ui-settings-grid">
            <section className="card ui-settings-card payment-settings-card">
              <div className="payment-settings-heading">
                <span className="payment-settings-icon">
                  <Icon name="card" />
                </span>
                <div>
                  <h2>Conta de recebimento</h2>
                  <p>
                    Escolha a conta usada para gerar o QR Code e o PIX Copia e
                    Cola dos clientes.
                  </p>
                </div>
              </div>
              <SettingsForm
                token={data.page.csrfToken}
                action="provedor-padrao"
              >
                <label className="field">
                  Receber PIX por
                  <select
                    className="input"
                    name="provider"
                    required
                    disabled={!active.length}
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
                  {active.length
                    ? 'O pagamento será confirmado pelo provedor. Salvar esta opção não gera cobrança.'
                    : 'Configure e ative um provedor abaixo para escolher a conta de recebimento.'}
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
            <section className="card ui-settings-card payment-settings-card">
              <div className="payment-settings-heading">
                <span className="payment-settings-icon">
                  <Icon name="message" />
                </span>
                <div>
                  <h2>Confirmação no WhatsApp</h2>
                  <p>
                    Envie uma mensagem ao cliente quando o provedor confirmar o
                    pagamento.
                  </p>
                </div>
              </div>
              <SettingsForm
                token={data.page.csrfToken}
                action="mensagem-confirmacao"
              >
                <label className="field">
                  Mensagem
                  <select
                    className="input"
                    name="mensagem_id"
                    defaultValue={String(data.mensagemConfirmacaoId ?? '')}
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
                  Escolha um modelo de <a href="/mensagens">Mensagens</a> e
                  mantenha o WhatsApp conectado. A renovação pode ainda estar em
                  processamento.
                </p>
                <button className="btn btn-primary" type="submit">
                  Salvar mensagem
                </button>
              </SettingsForm>
            </section>
          </div>
          <div className="int-pag-intro">
            <span className="int-pag-intro-ico">
              <Icon name="bolt" />
            </span>
            <div>
              <strong>Link de pagamento nas mensagens</strong>
              <p>
                Use <code>{'{link_cliente}'}</code> no modelo de mensagem. O
                cliente abre o link e gera o PIX com o provedor escolhido.
              </p>
            </div>
          </div>
          <h3 className="int-pag-titulo">Formas de pagamento</h3>
          <div className="int-pag-grid">
            {data.providers.map((provider) => (
              <div
                key={provider.id}
                className={`int-pag-card ${provider.ativo ? 'is-active' : ''}`}
                style={
                  {
                    '--card-accent': paymentProviders[provider.id].color,
                  } as React.CSSProperties
                }
                data-payment-provider={provider.id}
              >
                <div className="int-pag-card-head">
                  <div className="int-pag-ico">
                    <img
                      src={paymentProviders[provider.id].icon}
                      alt=""
                      width="32"
                      height="32"
                      loading="lazy"
                    />
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
                </div>
                <div className="int-pag-card-foot">
                  <a
                    className="int-pag-suporte"
                    href={paymentProviders[provider.id].support}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Suporte ↗
                  </a>
                  <button
                    className="btn btn-muted"
                    type="button"
                    onClick={() => setEditor(provider)}
                  >
                    <Icon name="edit" />{' '}
                    {provider.configurado ? 'Editar' : 'Configurar'}
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
    </PaymentAuthorization>
  );
}
