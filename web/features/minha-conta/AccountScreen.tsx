'use client';
import { useState, useEffect } from 'react';
import { CsrfInput } from '../../../src/frontend/clients/ui.tsx';
import { PanelStyles } from '../../components/layout/PanelStyles.tsx';
import { PanelShell, SiteNotice } from '../../components/layout/PanelShell.tsx';
import { LegacyControllers } from '../../components/legacy/LegacyControllers.tsx';

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
    let timer;
    async function refresh() {
      if (cancelled) return;
      if (!window.pushStatus) {
        timer = setTimeout(refresh, 100);
        return;
      }
      const state = await window.pushStatus();
      if (!cancelled) setPush(state);
    }
    refresh().catch(() => {
      if (!cancelled) setPush('unsupported');
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);
  async function togglePush(enable) {
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
  return (
    <>
      <PanelStyles />
      <meta name="csrf-token" content={data.page.csrfToken} />
      <PanelShell data={{ ...data, currentPath: '/minha-conta' }}>
        <SiteNotice success={data.success} error={data.error} />
        <div className="container page-account" data-react-page="minha-conta">
          <div className="section-header">
            <h2 className="section-title">Minha Conta</h2>
          </div>
          <div className="card account-card">
            <form
              method="post"
              action="/minha-conta"
              className="form-grid account-form-grid"
              {...noPasswordManager}
            >
              <CsrfInput token={data.page.csrfToken} />
              <label className="field">
                Nome
                <input
                  className="input"
                  name="name"
                  defaultValue={account.name || ''}
                  required
                />
              </label>
              <label className="field">
                Usuário
                <input
                  className="input"
                  name="username"
                  defaultValue={account.username || ''}
                  {...noPasswordManager}
                  required
                />
              </label>
              <label className="field">
                Senha atual (para alterar usuário ou senha)
                <input
                  className="input"
                  type="password"
                  name="current_password"
                  {...noPasswordManager}
                />
              </label>
              <label className="field">
                Nova senha
                <input
                  className="input"
                  type="password"
                  name="password"
                  minLength={8}
                  {...noPasswordManager}
                />
              </label>
              <label className="field">
                Confirmar senha
                <input
                  className="input"
                  type="password"
                  name="password_confirm"
                  {...noPasswordManager}
                />
              </label>
              <div className="modal-actions account-actions">
                <button className="btn btn-primary">Salvar alterações</button>
              </div>
            </form>
          </div>
          <div className="card account-card">
            <h3 style={{ marginTop: 0 }}>💠 Chave PIX</h3>
            <p className="muted">
              Configure sua chave PIX pra inserir nas mensagens usando a tag{' '}
              <code>{'{pix}'}</code>. Ela vira texto que o cliente copia com um
              toque longo no WhatsApp. Use <code>{'{pix_bloco}'}</code> pra
              inserir um bloco pronto (nome + chave formatados).
            </p>
            <form
              method="post"
              action="/minha-conta/pix"
              className="form-grid"
              data-native-submit="1"
            >
              <CsrfInput token={data.page.csrfToken} />
              <label className="field full">
                <span>Chave PIX</span>
                <input
                  className="input"
                  name="pix_chave"
                  value={pix.key}
                  onChange={(event) =>
                    setPix({
                      ...pix,
                      key: (event.target as HTMLInputElement).value,
                    })
                  }
                  placeholder="email, CPF/CNPJ, celular ou aleatória"
                />
              </label>
              <label className="field">
                <span>Nome do recebedor</span>
                <input
                  className="input"
                  name="pix_nome"
                  value={pix.name}
                  onChange={(event) =>
                    setPix({
                      ...pix,
                      name: (event.target as HTMLInputElement).value,
                    })
                  }
                  placeholder="Ex: João da Silva"
                />
              </label>
              <label className="field">
                <span>Tipo da chave</span>
                <select
                  className="input"
                  name="pix_tipo"
                  value={pix.type}
                  onChange={(event) =>
                    setPix({
                      ...pix,
                      type: (event.target as HTMLSelectElement).value,
                    })
                  }
                >
                  <option value="">— (não exibir)</option>
                  {['Celular', 'CPF', 'CNPJ', 'Email', 'Aleatória'].map(
                    (type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <div className="account-pix-preview full">
                <span className="muted" style={{ fontSize: '12.5px' }}>
                  Prévia do <code>{'{pix_bloco}'}</code>:
                </span>
                <pre className="account-pix-box">{`${pix.name ? `*${pix.name}*\n` : ''}${pix.type ? pix.type + ': ' : ''}${pix.key || 'sua-chave-aqui'}`}</pre>
              </div>
              <div className="modal-actions account-actions full">
                <button
                  className="btn btn-primary"
                  data-loading-text="Salvando"
                >
                  Salvar chave PIX
                </button>
              </div>
            </form>
          </div>
          <div className="card account-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>🔔 Notificações push</h3>
            <p className="muted">
              Receba avisos no celular ou desktop quando um cliente pagar, um
              status agendado falhar ou outras coisas importantes. Funciona
              mesmo com o gestor fechado, contanto que o navegador esteja aberto
              (ou app instalado).
            </p>
            <div className="push-state-row">
              <div
                id="push-state-msg"
                className="muted"
                style={{ fontSize: 13 }}
              >
                {
                  {
                    loading: 'Verificando…',
                    unsupported: 'Seu navegador não suporta notificações push.',
                    denied:
                      'Permissão negada. Habilite nas configurações do navegador.',
                    subscribed: '✓ Ativadas neste dispositivo.',
                    available: 'Notificações desativadas neste dispositivo.',
                  }[push]
                }
              </div>
              <div>
                {push === 'available' && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy}
                    onClick={() => togglePush(true)}
                  >
                    🔔 Ativar notificações
                  </button>
                )}
                {push === 'subscribed' && (
                  <button
                    className="btn btn-muted"
                    type="button"
                    disabled={busy}
                    onClick={() => togglePush(false)}
                  >
                    Desativar
                  </button>
                )}
              </div>
            </div>
            {error && (
              <p className="form-alert error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        <LegacyControllers revision={data} />
      </PanelShell>
    </>
  );
}
