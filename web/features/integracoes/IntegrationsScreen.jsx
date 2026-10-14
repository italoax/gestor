'use client';
import { useState } from 'react';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.jsx';
import { NativePanel } from '../../components/layout/NativePanel.jsx';
import { NativeDialog } from '../../components/ui/NativeDialog.jsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.js';

function IntegrationAction({ item, token, action, children }) {
  const submit = useNativeSubmit(
    action === 'delete_integracao' ? 'Remover esta integração?' : undefined,
  );
  return (
    <form
      method="post"
      action="/integracoes"
      className="integ-inline"
      onSubmit={submit}
    >
      <CsrfInput token={token} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="id" value={item.id} />
      {children}
    </form>
  );
}
function IntegrationEditor({ item, token, onClose }) {
  const submit = useNativeSubmit();
  return (
    <NativeDialog
      title={item ? 'Editar Integração' : 'Adicionar Integração Sigma'}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-muted" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn btn-primary"
            type="submit"
            form="react-integration-form"
          >
            Salvar
          </button>
        </>
      }
    >
      <form
        method="post"
        action="/integracoes"
        id="react-integration-form"
        className="modal-body"
        autoComplete="off"
        onSubmit={submit}
      >
        <CsrfInput token={token} />
        <input
          type="hidden"
          name="action"
          value={item ? 'update_integracao' : 'create_integracao'}
        />
        <input type="hidden" name="id" value={item?.id || ''} />
        <input type="hidden" name="tipo" value="sigma" />
        <div className="form-grid">
          <label className="field full">
            <span>Nome da integração *</span>
            <input
              className="input"
              name="nome"
              defaultValue={item?.nome || ''}
              required
              placeholder="Ex: Sigma GENIAL"
            />
          </label>
          <label className="field full">
            <span>URL do painel *</span>
            <input
              className="input"
              name="api_url"
              defaultValue={item?.apiUrl || ''}
              required
              placeholder="https://dashgen.net"
            />
            <small>A URL do painel usada para chamar a API.</small>
          </label>
          <label className="field">
            <span>Usuário / e-mail *</span>
            <input
              className="input"
              name="username"
              defaultValue={item?.username || ''}
              required
              autoComplete="off"
            />
          </label>
          <label className="field">
            <span>Senha do painel{item ? '' : ' *'}</span>
            <input
              className="input"
              name="password"
              type="password"
              autoComplete="new-password"
              required={!item}
            />
            <small>
              {item
                ? 'Deixe em branco para manter a senha atual.'
                : 'Informe a senha usada no painel.'}
            </small>
          </label>
          <label className="field full">
            <span>Status</span>
            <select
              className="input"
              name="status"
              defaultValue={item?.status || 'ativo'}
            >
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </label>
        </div>
        <div className="form-alert integ-cf-note">
          Se o teste retornar “bloqueado pelo Cloudflare”, peça ao provedor para
          liberar o IP do seu servidor.
        </div>
      </form>
    </NativeDialog>
  );
}
export function IntegrationsScreen({ data }) {
  const [editor, setEditor] = useState(null);
  const sigmas = data.integracoes.filter((item) => item.tipo === 'sigma');
  return (
    <NativePanel data={data} path="/integracoes">
      <link rel="stylesheet" href="/assets/css/native-integrations.css" />
      <div className="container page-integracoes" data-react-page="integracoes">
        <div className="integ-head">
          <div>
            <h2 className="section-title">
              <Icon name="link" /> Integrações
            </h2>
            <p className="muted">
              Conecte um painel IPTV para renovar seus clientes lá
              automaticamente ao renovar aqui.
            </p>
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => setEditor({ item: null })}
          >
            <Icon name="plus" /> Adicionar Integração
          </button>
        </div>
        <div className="ui-summary ui-summary-2">
          {[
            ['Sigma', sigmas.length, 'green'],
            ['Total', data.integracoes.length, 'blue'],
          ].map(([label, total, color]) => (
            <div key={label} className={`cli-stat accent-${color}`}>
              <div className="cli-stat-ico">
                <Icon name="settings" />
              </div>
              <div>
                <strong>{total}</strong>
                <span>{label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="card integ-card">
          <h3 className="integ-card-title">
            <Icon name="settings" /> Integrações Sigma
          </h3>
          {!sigmas.length ? (
            <div className="integ-empty">
              <p className="muted">Nenhuma integração Sigma configurada.</p>
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => setEditor({ item: null })}
              >
                Adicionar Primeira Integração
              </button>
            </div>
          ) : (
            <div className="integ-list">
              {sigmas.map((item) => (
                <div
                  className="integ-item"
                  key={item.id}
                  data-integration-item={item.id}
                >
                  <div className="integ-info">
                    <div className="integ-info-top">
                      <strong>{item.nome}</strong>
                      <span
                        className={`badge ${item.status === 'ativo' ? 'badge-green' : 'badge-muted'}`}
                      >
                        {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    <small className="muted">
                      {item.apiUrl} · 👤 {item.username}
                    </small>
                  </div>
                  <div className="integ-acoes">
                    <IntegrationAction
                      item={item}
                      token={data.page.csrfToken}
                      action="test_integracao"
                    >
                      <button className="btn btn-muted" type="submit">
                        🔌 Testar
                      </button>
                    </IntegrationAction>
                    <button
                      className="btn btn-muted"
                      type="button"
                      onClick={() => setEditor({ item })}
                    >
                      <Icon name="edit" /> Editar
                    </button>
                    <IntegrationAction
                      item={item}
                      token={data.page.csrfToken}
                      action="delete_integracao"
                    >
                      <button
                        className="btn btn-muted integ-danger"
                        type="submit"
                      >
                        <Icon name="trash" /> Excluir
                      </button>
                    </IntegrationAction>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {editor && (
        <IntegrationEditor
          item={editor.item}
          token={data.page.csrfToken}
          onClose={() => setEditor(null)}
        />
      )}
    </NativePanel>
  );
}
