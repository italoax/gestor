'use client';
import { useState, useEffect } from 'react';
import { PanelNotice } from '../../components/ui/PanelNotice.tsx';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { NativePanel } from '../../components/layout/NativePanel.tsx';
import { publicAssetUrl } from '../../lib/publicAssets.ts';
import { TwoFactorSettings } from './TwoFactorSettings.tsx';

function AccountIcon({ name }: { name: string }) {
  if (name !== 'bell' && name !== 'pix') return <Icon name={name} />;
  return (
    <svg
      className="ui-icon"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'bell' && (
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      )}
      {name === 'pix' && (
        <>
          <path d="m9 4 1.6-1.6a2 2 0 0 1 2.8 0L15 4m-6 16 1.6 1.6a2 2 0 0 0 2.8 0L15 20M4 9l-1.6 1.6a2 2 0 0 0 0 2.8L4 15m16-6 1.6 1.6a2 2 0 0 1 0 2.8L20 15" />
          <path d="M4 7h3l5 5 5-5h3M4 17h3l5-5 5 5h3" />
        </>
      )}
    </svg>
  );
}

function SectionHeading({
  id,
  icon,
  title,
  children,
}: {
  id: string;
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <header className="account-panel-heading">
      <span className={`account-section-icon account-section-icon--${icon}`}>
        <AccountIcon name={icon} />
      </span>
      <div>
        <h3 id={id}>{title}</h3>
        <p>{children}</p>
      </div>
    </header>
  );
}

export function AccountScreen({ data }: { data?: any }) {
  const account = data.account || {};
  const [pix, setPix] = useState({
    key: account.pixChave || '',
    name: account.pixNome || '',
    type: account.pixTipo || '',
  });
  const [push, setPush] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (cancelled) return;
      if (!window.pushStatus) {
        timer = setTimeout(() => {
          void refresh();
        }, 100);
        return;
      }
      try {
        const state = await window.pushStatus();
        if (!cancelled) setPush(state);
      } catch {
        if (!cancelled) setPush('unsupported');
      }
    }
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  async function togglePush(enable: boolean) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const action = enable ? window.pushSubscribe : window.pushUnsubscribe;
      if (!action || !(await action()))
        throw new Error(
          'Não foi possível atualizar as notificações. Tente novamente.',
        );
      setPush(await window.pushStatus());
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  const noPasswordManager = {
    autoComplete: 'off',
    'data-1p-ignore': '',
    'data-lpignore': 'true',
    'data-bwignore': '',
  };
  const pushLabel = {
    loading: 'Verificando…',
    unsupported: 'Indisponível',
    denied: 'Permissão bloqueada',
    subscribed: 'Ativadas',
    available: 'Desativadas',
  }[push];
  return (
    <NativePanel data={data} path="/minha-conta">
      <link
        rel="stylesheet"
        href={publicAssetUrl('/assets/css/native-account.css')}
        precedence="panel"
      />
      <div className="container page-account" data-react-page="minha-conta">
        <div className="account-layout">
          <div className="account-column">
            <section
              className="account-panel"
              aria-labelledby="account-profile-title"
            >
              <SectionHeading
                id="account-profile-title"
                icon="users"
                title="Dados do perfil"
              >
                Atualize seu nome e sua senha de acesso.
              </SectionHeading>
              <form
                method="post"
                action="/minha-conta"
                className="account-profile-form"
                data-account-profile-form=""
                {...noPasswordManager}
              >
                <CsrfInput token={data.page.csrfToken} />
                <div className="account-editor">
                  <div className="account-fields">
                    <label className="field">
                      Nome
                      <input
                        className="input"
                        name="name"
                        defaultValue={account.name || ''}
                        maxLength={120}
                        autoComplete="name"
                        required
                      />
                    </label>
                    <label className="field">
                      Usuário (fixo)
                      <input
                        className="input"
                        name="username"
                        defaultValue={account.username || ''}
                        readOnly
                        aria-describedby="account-username-help"
                        {...noPasswordManager}
                      />
                      <small id="account-username-help">
                        O usuário não pode ser alterado.
                      </small>
                    </label>
                    <label className="field">
                      Nova senha
                      <input
                        className="input"
                        type="password"
                        name="password"
                        minLength={15}
                        autoComplete="new-password"
                        placeholder="Mínimo de 15 caracteres"
                      />
                      <small>Deixe em branco para manter a senha atual.</small>
                    </label>
                    <label className="field">
                      Confirmar nova senha
                      <input
                        className="input"
                        type="password"
                        name="password_confirm"
                        autoComplete="new-password"
                        placeholder="Repita a nova senha"
                      />
                    </label>
                  </div>
                  <div
                    id="seguranca-sessoes"
                    className="account-session-action"
                  >
                    <div>
                      <strong>Encerrar todos os acessos</strong>
                      <p>
                        Desconecta sua conta em todos os dispositivos, incluindo
                        este.
                      </p>
                    </div>
                    <button
                      className="btn account-danger-button"
                      type="submit"
                      form="account-revoke-sessions-form"
                    >
                      <Icon name="logout" />
                      Encerrar sessões
                    </button>
                  </div>
                </div>
                <footer className="account-form-footer account-profile-footer">
                  <span>Salve as alterações de nome ou senha.</span>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    data-account-save=""
                    data-loading-text="Salvando"
                  >
                    Salvar alterações
                  </button>
                </footer>
              </form>
              <form
                id="account-revoke-sessions-form"
                method="post"
                action="/minha-conta/sessoes/revogar"
                hidden
              >
                <CsrfInput token={data.page.csrfToken} />
              </form>
            </section>
          </div>
          <div className="account-column">
            <section
              className="account-panel account-pix-panel"
              aria-labelledby="account-pix-title"
            >
              <SectionHeading
                id="account-pix-title"
                icon="pix"
                title="Recebimentos via Pix"
              >
                Sua chave pronta para enviar nas cobranças.
              </SectionHeading>
              <form
                method="post"
                action="/minha-conta/pix"
                className="account-pix-form"
                data-native-submit="1"
              >
                <CsrfInput token={data.page.csrfToken} />
                <div className="account-editor">
                  <div className="account-fields">
                    <label className="field account-wide">
                      Chave Pix
                      <input
                        className="input"
                        name="pix_chave"
                        value={pix.key}
                        onChange={(event) =>
                          setPix({ ...pix, key: event.target.value })
                        }
                        placeholder="E-mail, CPF/CNPJ, celular ou chave aleatória"
                      />
                    </label>
                    <label className="field">
                      Nome do recebedor
                      <input
                        className="input"
                        name="pix_nome"
                        value={pix.name}
                        onChange={(event) =>
                          setPix({ ...pix, name: event.target.value })
                        }
                        placeholder="Como aparece no banco"
                      />
                    </label>
                    <label className="field">
                      Tipo da chave
                      <select
                        className="input"
                        name="pix_tipo"
                        value={pix.type}
                        onChange={(event) =>
                          setPix({ ...pix, type: event.target.value })
                        }
                      >
                        <option value="">Não exibir tipo</option>
                        {['Celular', 'CPF', 'CNPJ', 'Email', 'Aleatória'].map(
                          (type) => (
                            <option key={type} value={type}>
                              {type}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                  </div>
                  <div className="account-message-preview">
                    <div className="account-preview-heading">
                      <Icon name="message" />
                      <span>PRÉVIA DA MENSAGEM</span>
                      <span className="account-live-label">Ao vivo</span>
                    </div>
                    <pre
                      className={`account-pix-box${pix.key ? '' : ' is-empty'}`}
                    >{`${pix.name ? `*${pix.name}*\n` : ''}${pix.type ? pix.type + ': ' : ''}${pix.key || 'sua-chave-aqui'}`}</pre>
                    <p>
                      Use <code>{'{pix}'}</code> para enviar a chave ou{' '}
                      <code>{'{pix_bloco}'}</code> para incluir os dados acima
                      nas suas mensagens. Use <code>{'{cobranca_pix}'}</code> em
                      um modelo sem anexo para enviar a cobrança com o valor do
                      cliente.
                    </p>
                  </div>
                </div>
                <footer className="account-form-footer account-profile-footer">
                  <span>
                    <AccountIcon name="pix" />
                    Dados para suas mensagens
                  </span>
                  <button
                    className="btn btn-primary"
                    type="submit"
                    data-loading-text="Salvando"
                  >
                    Salvar chave Pix
                  </button>
                </footer>
              </form>
            </section>
          </div>
          <TwoFactorSettings csrfToken={data.page.csrfToken} />
          <section
            className="account-panel account-notifications-panel"
            aria-labelledby="account-push-title"
          >
            <SectionHeading
              id="account-push-title"
              icon="bell"
              title="Notificações"
            >
              Fique por dentro, mesmo com o gestor fechado.
            </SectionHeading>
            <div className="account-notifications-body">
              <ul className="account-notification-benefits">
                <li>
                  <Icon name="card" />
                  Pagamentos recebidos
                </li>
                <li>
                  <Icon name="warning" />
                  Falhas em status agendados
                </li>
                <li>
                  <Icon name="bolt" />
                  Avisos importantes da sua operação
                </li>
              </ul>
              <div className="account-push-control">
                <div>
                  <strong>Neste dispositivo</strong>
                  <span
                    id="push-state-msg"
                    className={`account-push-state${push === 'subscribed' ? ' is-on' : ''}`}
                    role="status"
                  >
                    <span aria-hidden="true" />
                    {pushLabel}
                  </span>
                </div>
                {(push === 'available' || push === 'subscribed') && (
                  <button
                    className={`btn ${push === 'subscribed' ? 'btn-muted' : 'btn-primary'}`}
                    type="button"
                    disabled={busy}
                    onClick={() => togglePush(push !== 'subscribed')}
                  >
                    {busy
                      ? 'Atualizando…'
                      : push === 'subscribed'
                        ? 'Desativar'
                        : 'Ativar notificações'}
                  </button>
                )}
              </div>
              <p className="account-field-note">
                {push === 'denied'
                  ? 'Permita as notificações nas configurações do navegador para receber os avisos.'
                  : push === 'unsupported'
                    ? 'Este navegador não oferece suporte a notificações push. Tente em outro navegador compatível.'
                    : 'Mantenha o navegador aberto ou o aplicativo instalado para receber os avisos.'}
              </p>
              {error && (
                <PanelNotice inline error>
                  {error}
                </PanelNotice>
              )}
            </div>
          </section>
        </div>
      </div>
    </NativePanel>
  );
}
