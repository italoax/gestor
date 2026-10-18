import { PanelFlashNotice } from '../../../web/components/ui/PanelFlashNotice.tsx';
import { PanelNotice } from '../../../web/components/ui/PanelNotice.tsx';
import { Fragment } from 'react';
import { Icon, CsrfInput } from './ui.tsx';
import { memo } from 'react';
export const ClientsModals = memo(function ClientsModals({
  planos,
  servidores,
  mensagens,
  dispositivos,
  aplicativos,
  csrfToken,
  noticeSuccess,
  noticeError,
  clientForm,
}: {
  planos?: any;
  servidores?: any;
  mensagens?: any;
  dispositivos?: any;
  aplicativos?: any;
  csrfToken?: any;
  noticeSuccess?: any;
  noticeError?: any;
  clientForm?: any;
}) {
  return (
    <>
      <div
        className="modal-overlay client-modal"
        id="modal-send-whatsapp"
        aria-hidden="true"
        inert
      >
        <div className="modal">
          <div className="modal-header">
            <h3 id="whatsapp-title">Enviar Mensagem</h3>
            <button
              className="modal-close"
              type="button"
              data-close-modal=""
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <form
            method="post"
            action="/clientes"
            id="modal-send-whatsapp-form"
            className="modal-body"
            data-native-submit="1"
          >
            <CsrfInput token={csrfToken} />
            <input type="hidden" name="action" defaultValue="send_whatsapp" />
            <input type="hidden" name="id" defaultValue="" />
            <input type="hidden" name="media_tipo" defaultValue="" />
            <div className="form-grid">
              <div className="field full wa-client-box">
                <strong data-wa-nome="">—</strong>
                <span className="muted" data-wa-telefone=""></span>
              </div>
              <label className="field full">
                <span>Template (opcional)</span>
                <select
                  className="input"
                  name="mensagem_id"
                  data-wa-template=""
                >
                  <option value="">Selecione um template</option>
                  {mensagens.map((m, index) => {
                    return (
                      <Fragment key={m?.id ?? index}>
                        <option value={m.id} data-message={m.mensagem || ''}>
                          {m.titulo}
                        </option>
                      </Fragment>
                    );
                  })}
                </select>
              </label>
              <label className="field full">
                <span>Mensagem</span>
                <textarea
                  className="input"
                  name="mensagem_texto"
                  rows={4}
                  placeholder="Digite sua mensagem..."
                  data-wa-mensagem=""
                ></textarea>
              </label>
              <div className="field full">
                <span>Anexar Mídia</span>
                <div className="wa-media-btns">
                  <button
                    type="button"
                    className="btn btn-muted"
                    data-wa-media="image"
                  >
                    🖼 Imagem
                  </button>
                  <button
                    type="button"
                    className="btn btn-muted"
                    data-wa-media="video"
                  >
                    🎬 Vídeo
                  </button>
                  <button
                    type="button"
                    className="btn btn-muted"
                    data-wa-media="audio"
                  >
                    🎵 Áudio
                  </button>
                  <button
                    type="button"
                    className="btn btn-muted"
                    data-wa-media="document"
                  >
                    📄 Documento
                  </button>
                </div>
                <input
                  className="input wa-media-url"
                  type="url"
                  name="media_url"
                  placeholder="Cole o link da mídia (https://...)"
                  hidden
                />
              </div>
            </div>
          </form>
          <div className="modal-footer">
            <button className="btn btn-muted" type="button" data-close-modal="">
              Cancelar
            </button>
            <button
              className="btn btn-green"
              type="submit"
              form="modal-send-whatsapp-form"
              data-loading-text="Enviando mensagem"
            >
              ✈ Enviar
            </button>
          </div>
        </div>
      </div>
      <div
        className="modal-overlay client-modal"
        id="modal-add-cliente"
        aria-hidden="true"
        inert
      >
        <div className="modal modal-lg">
          <div className="modal-header">
            <h3>
              <Icon name={clientForm.editing ? 'edit' : 'plus'} />
              {clientForm.editing ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>
            <button
              className="modal-close"
              type="button"
              data-close-modal=""
              aria-label="Fechar"
            >
              ×
            </button>
          </div>
          <div className="modal-tabs">
            <button
              className={`tab-btn ${clientForm.tab === 'dados' ? 'active' : ''}`}
              onClick={() => clientForm.setTab('dados')}
              type="button"
              data-tab="dados"
            >
              <Icon name="users" />
              Dados
            </button>
            <button
              className={`tab-btn ${clientForm.tab === 'plano' ? 'active' : ''}`}
              onClick={() => clientForm.setTab('plano')}
              type="button"
              data-tab="plano"
            >
              <Icon name="package" />
              Plano
            </button>
            <button
              className={`tab-btn ${clientForm.tab === 'apps' ? 'active' : ''}`}
              onClick={() => clientForm.setTab('apps')}
              type="button"
              data-tab="apps"
            >
              <Icon name="phone" />
              Apps
            </button>
          </div>
          <form
            method="post"
            action="/clientes"
            id="modal-add-cliente-form"
            ref={clientForm.ref}
            data-react-client-form=""
            onReset={clientForm.reset}
            onChange={clientForm.onChange}
            onInput={clientForm.onInput}
            onSubmit={clientForm.onSubmit}
            className="modal-body"
            noValidate
            data-native-submit="1"
            autoComplete="off"
            data-1p-ignore=""
            data-lpignore="true"
            data-bwignore=""
          >
            <CsrfInput token={csrfToken} />
            <input
              type="hidden"
              name="action"
              value={clientForm.editing ? 'update_cliente' : 'create_cliente'}
            />
            <input type="hidden" name="id" value={clientForm.clientId} />
            <input type="hidden" name="status" value={clientForm.status} />
            <div id="modal-add-cliente-error" aria-live="polite">
              {Object.keys(clientForm.errors).length > 0 && (
                <PanelNotice
                  inline
                  error
                  text="Revise os campos obrigatórios destacados."
                />
              )}
            </div>
            <div
              className={`tab-panel ${clientForm.tab === 'dados' ? 'active' : ''}`}
              data-tab-panel="dados"
            >
              <div className="form-grid">
                <label className="field full">
                  <span>Nome *</span>
                  <input
                    className={
                      clientForm.errors.nome ? 'input input-error' : 'input'
                    }
                    name="nome"
                    placeholder="Nome completo do cliente"
                    required
                    data-required="1"
                    data-tab="dados"
                    data-field-label="Nome"
                    aria-invalid={Boolean(clientForm.errors.nome)}
                    aria-describedby="cliente-error-nome"
                  />
                  <small
                    className="field-error"
                    data-error-for="nome"
                    id="cliente-error-nome"
                    aria-live="polite"
                  >
                    {clientForm.errors.nome}
                  </small>
                </label>

                <label className="field">
                  <span>Usuário</span>
                  <input
                    className={
                      clientForm.errors.user ? 'input input-error' : 'input'
                    }
                    name="user"
                    placeholder="usuario123"
                    autoComplete="off"
                    data-1p-ignore=""
                    data-lpignore="true"
                    data-bwignore=""
                  />
                </label>
                <div className="field password-field" data-password-field="">
                  <label htmlFor="cliente-senha">
                    {clientForm.editing ? 'Nova senha IPTV' : 'Senha'}
                  </label>
                  <div className="password-control">
                    <input
                      id="cliente-senha"
                      className={
                        clientForm.errors.senha ? 'input input-error' : 'input'
                      }
                      type="password"
                      name="senha"
                      maxLength={190}
                      placeholder={
                        clientForm.editing
                          ? 'Em branco mantém a senha atual'
                          : undefined
                      }
                      autoComplete="off"
                      data-1p-ignore=""
                      data-lpignore="true"
                      data-bwignore=""
                    />
                    <button
                      type="button"
                      data-password-toggle=""
                      aria-label="Mostrar senha"
                      title="Mostrar senha"
                      aria-controls="cliente-senha"
                      aria-pressed="false"
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                      >
                        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span data-password-toggle-label="">Mostrar</span>
                    </button>
                  </div>
                  <span
                    data-password-feedback=""
                    role="status"
                    aria-live="polite"
                  ></span>
                  {clientForm.editing && (
                    <label>
                      <input type="checkbox" name="limpar_senha" value="1" />{' '}
                      Remover a senha atual
                    </label>
                  )}
                </div>

                <label className="field full">
                  <span>WhatsApp *</span>
                  <div className="input-icon phone-control">
                    <span className="icon-box" aria-hidden="true">
                      <Icon name="phone" />
                    </span>
                    <div className="phone-prefix" data-phone-prefix="">
                      <button
                        className="phone-prefix-btn"
                        type="button"
                        data-phone-prefix-toggle=""
                        aria-expanded="false"
                      >
                        +55
                      </button>
                      <input
                        type="hidden"
                        name="telefone_prefixo"
                        defaultValue="+55"
                        data-phone-prefix-value=""
                      />
                      <div className="phone-prefix-menu" hidden>
                        <input
                          className="input phone-prefix-search"
                          type="search"
                          placeholder="Buscar país ou prefixo"
                          data-phone-prefix-search=""
                        />
                        <div
                          className="phone-prefix-list"
                          data-phone-prefix-list=""
                        ></div>
                      </div>
                    </div>
                    <input
                      className={
                        clientForm.errors.telefone
                          ? 'input input-error'
                          : 'input'
                      }
                      type="tel"
                      name="telefone"
                      placeholder="(00) 0 0000-0000"
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={18}
                      required
                      data-phone-mask=""
                      data-required="1"
                      data-tab="dados"
                      data-field-label="WhatsApp"
                      aria-invalid={Boolean(clientForm.errors.telefone)}
                      aria-describedby="cliente-error-telefone"
                    />
                  </div>
                  <small
                    className="field-error"
                    data-error-for="telefone"
                    id="cliente-error-telefone"
                    aria-live="polite"
                  >
                    {clientForm.errors.telefone}
                  </small>
                </label>
                <details className="field full cli-details">
                  <summary>+ Adicionar contato secundário</summary>
                  <input
                    className={
                      clientForm.errors.telefone_secundario
                        ? 'input input-error'
                        : 'input'
                    }
                    name="telefone_secundario"
                    placeholder="(00) 0 0000-0000"
                  />
                </details>
                <label className="field">
                  <span>Captação</span>
                  <select
                    className={
                      clientForm.errors.captacao ? 'input input-error' : 'input'
                    }
                    name="captacao"
                  >
                    <option value="">Origem do cliente</option>
                    <option>Indicação</option>
                    <option>Instagram</option>
                    <option>WhatsApp</option>
                    <option>Facebook</option>
                    <option>Google</option>
                    <option>Outro</option>
                  </select>
                </label>
                <label className="field full">
                  <span>Observações</span>
                  <textarea
                    className="input"
                    name="observacoes"
                    placeholder="Observações internas sobre o cliente..."
                  ></textarea>
                </label>

                <label
                  className="switch-field full"
                  data-only-new=""
                  hidden={clientForm.editing}
                >
                  <span>
                    <strong>
                      <Icon name="message" />
                      Enviar mensagem
                    </strong>
                    <small>
                      Dispara um template pelo WhatsApp logo após salvar o
                      cliente.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    name="enviar_boas_vindas"
                    checked={clientForm.sendMessage}
                    onChange={clientForm.ignoreChange}
                    defaultValue="1"
                    className="switch"
                    data-toggle-template=""
                  />
                </label>
                <label
                  className="field full"
                  data-template-wrapper=""
                  data-only-new=""
                  hidden={clientForm.editing || !clientForm.sendMessage}
                >
                  <span>Template a enviar *</span>
                  <select
                    className={
                      clientForm.errors.template_boas_vindas
                        ? 'input input-error'
                        : 'input'
                    }
                    name="template_boas_vindas"
                    value={clientForm.template}
                    onChange={clientForm.ignoreChange}
                  >
                    <option value="">Selecione um template</option>
                    {mensagens.map((m, index) => {
                      return (
                        <Fragment key={m?.id ?? index}>
                          <option value={m.id}>{m.titulo}</option>
                        </Fragment>
                      );
                    })}
                  </select>
                </label>
              </div>
            </div>
            <div
              className={`tab-panel client-plan-panel ${clientForm.tab === 'plano' ? 'active' : ''}`}
              data-tab-panel="plano"
            >
              <div className="server-selection">
                <span>Servidores *</span>
                <details
                  open
                  className="server-picker"
                  data-servidores-multiselect=""
                >
                  <summary data-servidores-resumo="">
                    {clientForm.servers.join(' + ') ||
                      'Selecione os servidores'}
                  </summary>
                  <div data-servidores-opcoes="" className="server-options">
                    {[
                      ...new Set([
                        ...servidores.map((s) => s.nome),
                        ...clientForm.servers,
                      ]),
                    ].map((name) => (
                      <label className="server-option" key={name}>
                        <input
                          type="checkbox"
                          value={name}
                          checked={clientForm.servers.includes(name)}
                          disabled={
                            clientForm.additional &&
                            !clientForm.servers.includes(name)
                          }
                          onChange={(event) =>
                            clientForm.toggleServer(
                              name,
                              (event.target as HTMLInputElement).checked,
                            )
                          }
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </details>
                <small>Marque um ou dois servidores para este cliente.</small>
                <select
                  hidden
                  name="servidor"
                  value={clientForm.servers[0] || ''}
                  onChange={clientForm.ignoreChange}
                  data-valor-cred-select=""
                  aria-invalid={Boolean(clientForm.errors.servidor)}
                  aria-describedby="cliente-error-servidor"
                  data-required="1"
                  data-tab="plano"
                  data-field-label="Servidor"
                >
                  <option value="">Selecione o servidor</option>
                  {servidores.map((s, index) => {
                    return (
                      <Fragment key={s?.id ?? index}>
                        <option
                          value={s.nome}
                          data-valor-cred={s.valorCred || 0}
                        >
                          {s.nome}
                        </option>
                      </Fragment>
                    );
                  })}
                  {clientForm.servers
                    .filter((name) => !servidores.some((s) => s.nome === name))
                    .map((name) => (
                      <option key={name} value={name}>
                        {name} (atual)
                      </option>
                    ))}
                </select>
                <small
                  className="field-error"
                  data-error-for="servidor"
                  id="cliente-error-servidor"
                  aria-live="polite"
                >
                  {clientForm.errors.servidor}
                </small>
              </div>
              <p className="muted">
                Campos com * são obrigatórios. Dados de acesso e integração são
                opcionais.
              </p>
              <p className="server-selection-help">
                Selecione acima os servidores. Ajuste abaixo o valor e a
                validade de cada acesso.
              </p>
              <section
                className="server-access-card"
                aria-labelledby="primary-server-title"
              >
                <h4 id="primary-server-title" data-principal-titulo="">
                  {clientForm.servers[0] || 'Primeiro servidor'}
                </h4>
                <div className="form-grid">
                  <div className="field">
                    <span>Plano *</span>
                    <select
                      className={
                        clientForm.errors.plano ? 'input input-error' : 'input'
                      }
                      name="plano"
                      data-required="1"
                      data-tab="plano"
                      data-field-label="Plano"
                      aria-invalid={Boolean(clientForm.errors.plano)}
                      aria-describedby="cliente-error-plano"
                    >
                      <option value="">Selecione o plano</option>
                      {planos
                        .filter((p) => p.ativo)
                        .map((p, index) => {
                          return (
                            <Fragment key={p?.id ?? index}>
                              <option
                                value={p.nome}
                                data-creditos={p.creditoGastos || 0}
                              >
                                {p.nome}
                              </option>
                            </Fragment>
                          );
                        })}
                    </select>
                    <small
                      className="field-error"
                      data-error-for="plano"
                      id="cliente-error-plano"
                      aria-live="polite"
                    >
                      {clientForm.errors.plano}
                    </small>
                  </div>
                  <label className="field">
                    <span>Valor (R$) *</span>
                    <input
                      className={
                        clientForm.errors.valor ? 'input input-error' : 'input'
                      }
                      type="number"
                      step="0.01"
                      name="valor"
                      min="0.01"
                      placeholder="0,00"
                      data-required="1"
                      data-tab="plano"
                      data-field-label="Valor"
                      aria-invalid={Boolean(clientForm.errors.valor)}
                      aria-describedby="cliente-error-valor"
                    />
                    <small
                      className="field-error"
                      data-error-for="valor"
                      id="cliente-error-valor"
                      aria-live="polite"
                    >
                      {clientForm.errors.valor}
                    </small>
                  </label>
                  <label className="field">
                    <span>Telas *</span>
                    <input
                      className={
                        clientForm.errors.telas ? 'input input-error' : 'input'
                      }
                      type="number"
                      name="telas"
                      defaultValue="1"
                      min="1"
                      step="1"
                      data-required="1"
                      data-tab="plano"
                      data-field-label="Telas"
                      data-telas-input=""
                      aria-invalid={Boolean(clientForm.errors.telas)}
                      aria-describedby="cliente-error-telas"
                    />
                    <small
                      className="field-error"
                      data-error-for="telas"
                      id="cliente-error-telas"
                      aria-live="polite"
                    >
                      {clientForm.errors.telas}
                    </small>
                    <small>
                      Muda o valor na mesma proporção (2 telas = 2× o valor).
                      Ajuste o valor à mão pra dar desconto.
                    </small>
                  </label>
                  <label className="field">
                    <span>Vencimento *</span>
                    <input
                      className={
                        clientForm.errors.vencimento
                          ? 'input input-error'
                          : 'input'
                      }
                      type="text"
                      name="vencimento"
                      placeholder="dd/mm/aaaa"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={10}
                      pattern="\d{2}/\d{2}/\d{4}"
                      title="Use dd/mm/aaaa"
                      required
                      data-date-mask=""
                      data-required="1"
                      data-tab="plano"
                      data-field-label="Vencimento"
                      aria-invalid={Boolean(clientForm.errors.vencimento)}
                      aria-describedby="cliente-error-vencimento"
                    />
                    <small
                      className="field-error"
                      data-error-for="vencimento"
                      id="cliente-error-vencimento"
                      aria-live="polite"
                    >
                      {clientForm.errors.vencimento}
                    </small>
                  </label>
                  <label className="field">
                    <span>Hora de Vencimento</span>
                    <input
                      className={
                        clientForm.errors.hora_vencimento
                          ? 'input input-error'
                          : 'input'
                      }
                      type="time"
                      name="hora_vencimento"
                      defaultValue="23:59"
                    />
                  </label>
                </div>
              </section>
              <section
                className="server-access-card"
                data-plano-adicional=""
                hidden={!clientForm.additional}
              >
                <label className="field full">
                  <span data-adicional-titulo="">
                    {clientForm.servers[1] || 'Segundo servidor'}
                  </span>
                  <select
                    hidden
                    name="adicional_servidor"
                    value={clientForm.servers[1] || ''}
                    onChange={clientForm.ignoreChange}
                    aria-invalid={Boolean(clientForm.errors.adicional_servidor)}
                    aria-describedby="cliente-error-adicional_servidor"
                    disabled={!clientForm.additional}
                    required={clientForm.additional}
                    data-required={clientForm.additional ? '1' : undefined}
                    data-tab="plano"
                    data-field-label="Segundo servidor"
                  >
                    <option value="">Selecione</option>
                    {servidores.map((s, index) => {
                      return (
                        <Fragment key={s?.id ?? index}>
                          <option value={s.nome}>{s.nome}</option>
                        </Fragment>
                      );
                    })}
                    {clientForm.servers
                      .filter(
                        (name) => !servidores.some((s) => s.nome === name),
                      )
                      .map((name) => (
                        <option key={name} value={name}>
                          {name} (atual)
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-grid">
                  <label className="field">
                    <span>Plano *</span>
                    <select
                      className={
                        clientForm.errors.adicional_plano
                          ? 'input input-error'
                          : 'input'
                      }
                      name="adicional_plano"
                      aria-invalid={Boolean(clientForm.errors.adicional_plano)}
                      aria-describedby="cliente-error-adicional_plano"
                      disabled={!clientForm.additional}
                      required={clientForm.additional}
                      data-required={clientForm.additional ? '1' : undefined}
                      data-tab="plano"
                      data-field-label="Plano do segundo servidor"
                    >
                      <option value="">Selecione</option>
                      {planos
                        .filter((p) => p.ativo)
                        .map((p, index) => {
                          return (
                            <Fragment key={p?.id ?? index}>
                              <option value={p.nome}>{p.nome}</option>
                            </Fragment>
                          );
                        })}
                    </select>
                    <small
                      className="field-error"
                      data-error-for="adicional_plano"
                      id="cliente-error-adicional_plano"
                      aria-live="polite"
                    >
                      {clientForm.errors.adicional_plano}
                    </small>
                  </label>
                  <label className="field">
                    <span>Valor (R$) *</span>
                    <input
                      className={
                        clientForm.errors.adicional_valor
                          ? 'input input-error'
                          : 'input'
                      }
                      type="number"
                      min="0.01"
                      step="0.01"
                      name="adicional_valor"
                      placeholder="0,00"
                      aria-invalid={Boolean(clientForm.errors.adicional_valor)}
                      aria-describedby="cliente-error-adicional_valor"
                      disabled={!clientForm.additional}
                      required={clientForm.additional}
                      data-required={clientForm.additional ? '1' : undefined}
                      data-tab="plano"
                      data-field-label="Valor do segundo servidor"
                    />
                    <small
                      className="field-error"
                      data-error-for="adicional_valor"
                      id="cliente-error-adicional_valor"
                      aria-live="polite"
                    >
                      {clientForm.errors.adicional_valor}
                    </small>
                  </label>
                  <label className="field">
                    <span>Telas *</span>
                    <input
                      className={
                        clientForm.errors.adicional_telas
                          ? 'input input-error'
                          : 'input'
                      }
                      type="number"
                      min="1"
                      step="1"
                      name="adicional_telas"
                      defaultValue="1"
                      aria-invalid={Boolean(clientForm.errors.adicional_telas)}
                      aria-describedby="cliente-error-adicional_telas"
                      disabled={!clientForm.additional}
                      required={clientForm.additional}
                      data-required={clientForm.additional ? '1' : undefined}
                      data-tab="plano"
                      data-field-label="Telas do segundo servidor"
                    />
                    <small
                      className="field-error"
                      data-error-for="adicional_telas"
                      id="cliente-error-adicional_telas"
                      aria-live="polite"
                    >
                      {clientForm.errors.adicional_telas}
                    </small>
                  </label>
                  <label className="field">
                    <span>Vencimento *</span>
                    <input
                      className={
                        clientForm.errors.adicional_vencimento
                          ? 'input input-error'
                          : 'input'
                      }
                      type="date"
                      name="adicional_vencimento"
                      aria-invalid={Boolean(
                        clientForm.errors.adicional_vencimento,
                      )}
                      aria-describedby="cliente-error-adicional_vencimento"
                      disabled={!clientForm.additional}
                      required={clientForm.additional}
                      data-required={clientForm.additional ? '1' : undefined}
                      data-tab="plano"
                      data-field-label="Vencimento do segundo servidor"
                    />
                    <small
                      className="field-error"
                      data-error-for="adicional_vencimento"
                      id="cliente-error-adicional_vencimento"
                      aria-live="polite"
                    >
                      {clientForm.errors.adicional_vencimento}
                    </small>
                  </label>
                </div>
                <details className="server-extra">
                  <summary>Dados de acesso e integração (opcional)</summary>
                  <div className="form-grid">
                    <label className="field">
                      <span>Usuário do segundo servidor</span>
                      <input
                        className={
                          clientForm.errors.adicional_user
                            ? 'input input-error'
                            : 'input'
                        }
                        name="adicional_user"
                        maxLength={120}
                        disabled={!clientForm.additional}
                      />
                    </label>
                    <label className="field full">
                      <span>ID do segundo servidor no painel Sigma</span>
                      <input
                        className={
                          clientForm.errors.adicional_id_painel
                            ? 'input input-error'
                            : 'input'
                        }
                        name="adicional_id_painel"
                        maxLength={120}
                        disabled={!clientForm.additional}
                      />
                      <small>
                        Use o ID do acesso correspondente ao segundo servidor.
                      </small>
                    </label>
                  </div>
                </details>
              </section>
              <div className="server-total">
                <span>Total por renovação</span>
                <strong data-cadastro-total="">
                  {clientForm.total.toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL',
                  })}
                </strong>
              </div>
              <div className="form-grid server-payment">
                <label className="field">
                  <span>Pagamento *</span>
                  <select
                    className={
                      clientForm.errors.forma_pagamento
                        ? 'input input-error'
                        : 'input'
                    }
                    name="forma_pagamento"
                    data-required="1"
                    data-tab="plano"
                    data-field-label="Pagamento"
                    aria-invalid={Boolean(clientForm.errors.forma_pagamento)}
                    aria-describedby="cliente-error-forma_pagamento"
                  >
                    <option value="">Selecione</option>
                    <option>PIX</option>
                    <option>Dinheiro</option>
                    <option>Cartão</option>
                  </select>

                  <small
                    className="field-error"
                    data-error-for="forma_pagamento"
                    id="cliente-error-forma_pagamento"
                    aria-live="polite"
                  >
                    {clientForm.errors.forma_pagamento}
                  </small>
                </label>
                <label
                  className="switch-field full"
                  data-only-new=""
                  hidden={clientForm.editing}
                >
                  <span>
                    <strong>💲 Registrar pagamento ao salvar</strong>
                    <small>
                      Conta como pago agora e baixa crédito do servidor.
                      Desmarque para só cadastrar.
                    </small>
                  </span>
                  <input
                    type="checkbox"
                    name="registrar_pagamento"
                    defaultValue="1"
                    className="switch"
                    defaultChecked
                  />
                </label>
              </div>
              <input
                type="hidden"
                name="creditos_gastos"
                defaultValue="1"
                data-creditos-input=""
              />
              <input type="hidden" name="planos_form" defaultValue="1" />
              <input
                type="checkbox"
                name="tem_plano_adicional"
                checked={clientForm.additional}
                readOnly
                defaultValue="1"
                data-toggle-adicional=""
                hidden
              />
            </div>
            <div
              className={`tab-panel ${clientForm.tab === 'apps' ? 'active' : ''}`}
              data-tab-panel="apps"
            >
              <p className="muted">
                Escolha o aplicativo usado em cada servidor.
              </p>
              <section className="cli-apps-card">
                <strong data-app-principal="">
                  {clientForm.servers[0] || 'Primeiro servidor'}
                </strong>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      <Icon name="monitor" />
                      Dispositivo
                    </span>
                    <select
                      className={
                        clientForm.errors.dispositivo
                          ? 'input input-error'
                          : 'input'
                      }
                      name="dispositivo"
                    >
                      <option value="">Selecione o dispositivo</option>
                      {(typeof dispositivos !== 'undefined'
                        ? dispositivos
                        : []
                      ).map((d, index) => {
                        return (
                          <Fragment key={d?.id ?? index}>
                            <option value={d}>{d}</option>
                          </Fragment>
                        );
                      })}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      <Icon name="phone" />
                      Aplicativo *
                    </span>
                    <select
                      className={
                        clientForm.errors.aplicativo
                          ? 'input input-error'
                          : 'input'
                      }
                      name="aplicativo"
                      required
                      data-required="1"
                      data-tab="apps"
                      data-field-label="Aplicativo do primeiro servidor"
                      aria-invalid={Boolean(clientForm.errors.aplicativo)}
                      aria-describedby="cliente-error-aplicativo"
                    >
                      <option value="">Selecione o aplicativo</option>
                      {(typeof aplicativos !== 'undefined'
                        ? aplicativos
                        : []
                      ).map((a, index) => {
                        return (
                          <Fragment key={a?.id ?? index}>
                            <option value={a}>{a}</option>
                          </Fragment>
                        );
                      })}
                    </select>
                    <small
                      className="field-error"
                      data-error-for="aplicativo"
                      id="cliente-error-aplicativo"
                      aria-live="polite"
                    >
                      {clientForm.errors.aplicativo}
                    </small>
                  </label>
                </div>
              </section>
              <section
                className="cli-apps-card"
                data-app-adicional=""
                hidden={!clientForm.additional}
              >
                <strong data-app-segundo="">
                  {clientForm.servers[1] || 'Segundo servidor'}
                </strong>
                <div className="form-grid">
                  <label className="field">
                    <span>
                      <Icon name="monitor" />
                      Dispositivo
                    </span>
                    <select
                      className={
                        clientForm.errors.adicional_dispositivo
                          ? 'input input-error'
                          : 'input'
                      }
                      name="adicional_dispositivo"
                      disabled={!clientForm.additional}
                    >
                      <option value="">Selecione o dispositivo</option>
                      {(typeof dispositivos !== 'undefined'
                        ? dispositivos
                        : []
                      ).map((d, index) => {
                        return (
                          <Fragment key={d?.id ?? index}>
                            <option value={d}>{d}</option>
                          </Fragment>
                        );
                      })}
                    </select>
                  </label>
                  <label className="field">
                    <span>
                      <Icon name="phone" />
                      Aplicativo
                    </span>
                    <select
                      className={
                        clientForm.errors.adicional_aplicativo
                          ? 'input input-error'
                          : 'input'
                      }
                      name="adicional_aplicativo"
                      aria-invalid={Boolean(
                        clientForm.errors.adicional_aplicativo,
                      )}
                      aria-describedby="cliente-error-adicional_aplicativo"
                      disabled={!clientForm.additional}
                      required={clientForm.additional}
                      data-required={clientForm.additional ? '1' : undefined}
                      data-tab="apps"
                      data-field-label="Aplicativo do segundo servidor"
                    >
                      <option value="">Selecione o aplicativo</option>
                      {(typeof aplicativos !== 'undefined'
                        ? aplicativos
                        : []
                      ).map((a, index) => {
                        return (
                          <Fragment key={a?.id ?? index}>
                            <option value={a}>{a}</option>
                          </Fragment>
                        );
                      })}
                    </select>
                    <small
                      className="field-error"
                      data-error-for="adicional_aplicativo"
                      id="cliente-error-adicional_aplicativo"
                      aria-live="polite"
                    >
                      {clientForm.errors.adicional_aplicativo}
                    </small>
                  </label>
                </div>
              </section>
            </div>
          </form>
          <div className="modal-footer">
            <button className="btn btn-muted" type="button" data-close-modal="">
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              form="modal-add-cliente-form"
            >
              {clientForm.editing ? 'Salvar Cliente' : 'Cadastrar Cliente'}
            </button>
          </div>
        </div>
      </div>
      <PanelFlashNotice success={noticeSuccess} error={noticeError} />

      <div
        className="modal-overlay client-modal"
        id="modal-client-access"
        aria-hidden="true"
        inert
      >
        <div className="modal modal-sm access-dialog">
          <div className="modal-header">
            <h3>Acesso do cliente</h3>
            <button
              className="modal-close"
              type="button"
              data-close-modal=""
              aria-label="Fechar"
            >
              &times;
            </button>
          </div>
          <div className="modal-body">
            <CsrfInput token={csrfToken} />
            <div className="access-identity">
              <div>
                <h3 data-access-name=""></h3>
                <p data-access-user=""></p>
              </div>
              <span className="access-state" data-access-state=""></span>
            </div>
            <div
              className="access-notice"
              data-access-notice=""
              role="status"
              aria-live="polite"
            ></div>
            <div className="access-actions" data-access-actions="" hidden>
              <button
                type="button"
                className="btn btn-primary access-copy"
                data-access-copy=""
              >
                Copiar link de acesso
              </button>
              <input
                className="input access-link"
                data-access-link=""
                readOnly
                hidden
                aria-label="Link de acesso do cliente"
              />
              <p className="access-hint">
                Envie o link apenas a este cliente. Ele permite entrar sem
                senha.
              </p>
              <div className="access-setting">
                <div>
                  <strong>Entrada na conta</strong>
                  <p>Controle o acesso do cliente.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-access-toggle=""
                ></button>
              </div>
              <div className="access-revoke">
                <strong>Substituir o link atual</strong>
                <p>
                  O link antigo e as sess&#245;es abertas deixam de funcionar.
                  Um novo link ser&#225; gerado na pr&#243;xima c&#243;pia ou
                  envio.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary"
                  data-access-revoke=""
                >
                  Revogar link
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
});
