'use client';
import { useEffect, useRef, useState } from 'react';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.jsx';
import { PanelStyles } from '../../components/layout/PanelStyles.jsx';
import { PanelShell, SiteNotice } from '../../components/layout/PanelShell.jsx';
import { LegacyControllers } from '../../components/legacy/LegacyControllers.jsx';

const configs = {
  planos: {
    singular: 'plano',
    label: 'Plano',
    icon: 'package',
    card: 'plano-card',
    grid: 'plano-grid',
  },
  servidores: {
    singular: 'servidor',
    label: 'Servidor',
    icon: 'server',
    card: 'srv-card',
    grid: 'srv-grid',
  },
  aplicativos: {
    singular: 'aplicativo',
    label: 'Aplicativo',
    icon: 'phone',
    card: 'disp-card app-card',
    grid: 'disp-grid',
  },
  dispositivos: {
    singular: 'dispositivo',
    label: 'Dispositivo',
    icon: 'monitor',
    card: 'disp-card device-card',
    grid: 'disp-grid',
  },
};
const number = (value) =>
  Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const money = (value) =>
  Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
const normalize = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const active = (item) =>
  item.ativo == null ? item.status !== 'Inativo' : Boolean(Number(item.ativo));

function DeleteForm({ catalog, item, token }) {
  const submitted = useRef(false);
  useEffect(() => {
    const reset = () => {
      submitted.current = false;
    };
    window.addEventListener('pageshow', reset);
    return () => window.removeEventListener('pageshow', reset);
  }, []);
  return (
    <form
      className="action-form disp-del-form"
      method="post"
      action={`/${catalog}`}
      onSubmit={(event) => {
        if (submitted.current || !window.confirm(`Deseja apagar ${item.nome}?`))
          event.preventDefault();
        else submitted.current = true;
      }}
    >
      <CsrfInput token={token} />
      <input
        type="hidden"
        name="action"
        value={`delete_${configs[catalog].singular}`}
      />
      <input type="hidden" name="id" value={item.id} />
      <button
        type="submit"
        className="cli-ico-btn danger"
        aria-label={`Apagar ${item.nome}`}
      >
        <Icon name="trash" /> Excluir
      </button>
    </form>
  );
}

function CatalogEditor({ catalog, item, focusCredit, token, onClose }) {
  const config = configs[catalog];
  const dialog = useRef(null);
  const submitted = useRef(false);
  const [tipo, setTipo] = useState(item?.tipo || 'Dias');
  const [periodo, setPeriodo] = useState(item?.periodo ?? 30);
  const [creditos, setCreditos] = useState(item?.creditos ?? 1);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    const reset = () => {
      submitted.current = false;
    };
    window.addEventListener('pageshow', reset);
    element.showModal();
    document.body.classList.add('modal-open');
    if (focusCredit) {
      const input = element.querySelector('[name="creditos"]');
      input?.focus();
      input?.select();
    }
    return () => {
      element.close();
      window.removeEventListener('pageshow', reset);
      document.body.classList.remove('modal-open');
      if (trigger?.isConnected) trigger.focus();
    };
  }, [focusCredit]);
  function field(label, name, value, props = {}) {
    return (
      <label className="field">
        <span>{label}</span>
        <input
          className="input"
          name={name}
          defaultValue={value ?? ''}
          {...props}
        />
      </label>
    );
  }
  return (
    <dialog
      ref={dialog}
      className="modal react-catalog-dialog"
      style={{
        width: 'min(600px, calc(100vw - 24px))',
        maxHeight: '90dvh',
        overflow: 'auto',
        padding: 0,
        margin: 'auto',
        color: 'var(--text)',
      }}
      aria-labelledby="catalog-editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-header">
        <h3 id="catalog-editor-title">
          {focusCredit
            ? 'Ajustar saldo'
            : `${item ? 'Editar' : 'Novo'} ${config.label}`}
        </h3>
        <button
          type="button"
          className="modal-close"
          aria-label="Fechar"
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <form
        method="post"
        action={`/${catalog}`}
        id="react-catalog-form"
        className="modal-body"
        data-native-submit="1"
        onSubmit={(event) => {
          if (submitted.current) event.preventDefault();
          else submitted.current = true;
        }}
      >
        <CsrfInput token={token} />
        <input
          type="hidden"
          name="action"
          value={`${item ? 'update' : 'create'}_${config.singular}`}
        />
        <input type="hidden" name="id" value={item?.id ?? ''} />
        <div className="form-grid">
          {field(`Nome do ${config.label} *`, 'nome', item?.nome, {
            required: true,
          })}
          {catalog === 'planos' && (
            <>
              <label className="field">
                <span>Tipo de Período *</span>
                <select
                  className="input"
                  name="tipo"
                  value={tipo}
                  onChange={(event) => setTipo(event.target.value)}
                >
                  <option>Dias</option>
                  <option>Meses</option>
                </select>
              </label>
              <label className="field">
                <span>Período ({tipo === 'Meses' ? 'meses' : 'dias'}) *</span>
                <input
                  className="input"
                  type="number"
                  name="periodo"
                  min="1"
                  max="2147483647"
                  step="1"
                  required
                  value={periodo}
                  onChange={(event) => setPeriodo(event.target.value)}
                />
              </label>
              <label className="field">
                <span>Créditos *</span>
                <input
                  className="input"
                  type="number"
                  name="creditos"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  required
                  value={creditos}
                  onChange={(event) => setCreditos(event.target.value)}
                />
              </label>
              {field(
                'Sigma: package_id (opcional)',
                'sigma_package_id',
                item?.sigmaPackageId,
                { maxLength: 120, autoComplete: 'off' },
              )}
              {field(
                'Sigma: conexões',
                'sigma_connections',
                item?.sigmaConnections || 1,
                {
                  type: 'number',
                  min: 1,
                  max: 2147483647,
                  step: 1,
                  required: true,
                },
              )}
              <div className="field full plano-info">
                Este plano terá duração de{' '}
                <strong>
                  {periodo} {tipo.toLowerCase()}
                </strong>{' '}
                e consumirá <strong>{number(creditos)} crédito(s)</strong> do
                servidor ao renovar.
              </div>
              <label className="switch-field full">
                <span>
                  <strong>Plano Ativo</strong>
                  <small>
                    Planos inativos não aparecem para novos cadastros
                  </small>
                </span>
                <input
                  type="checkbox"
                  className="switch"
                  name="ativo"
                  value="1"
                  defaultChecked={!item || active(item)}
                />
              </label>
            </>
          )}
          {catalog === 'servidores' && (
            <>
              <input
                type="hidden"
                name="identificador"
                value={item?.identificador || ''}
              />
              <input type="hidden" name="sessao" value="Não definido" />
              {field('Saldo de créditos', 'creditos', item?.creditos ?? 0, {
                type: 'number',
                step: '0.01',
              })}
              {field(
                'Custo por Crédito (R$)',
                'valor_cred',
                item?.valorCred ?? 2,
                { type: 'number', step: '0.01' },
              )}
              <small className="field full muted">
                Informe o saldo total disponível no servidor e o custo médio por
                crédito.
              </small>
            </>
          )}
          {catalog === 'aplicativos' &&
            field(
              'Valor da renovação (R$)',
              'valor_renovacao',
              item?.valorRenovacao ?? 0,
              { type: 'number', step: '0.01', min: 0 },
            )}
          <label className="field full">
            <span>
              {catalog === 'servidores' ? 'Observações' : 'Descrição'}
            </span>
            <textarea
              className="input"
              name={
                catalog === 'planos'
                  ? 'observacao'
                  : catalog === 'servidores'
                    ? 'observacao_servidor'
                    : 'descricao'
              }
              defaultValue={
                item?.observacao ??
                item?.observacaoServidor ??
                item?.descricao ??
                ''
              }
            />
          </label>
          {['aplicativos', 'dispositivos'].includes(catalog) && (
            <label className="field full">
              <span>Status</span>
              <select
                className="input"
                name="status"
                defaultValue={item?.status || 'Ativo'}
              >
                <option>Ativo</option>
                <option>Inativo</option>
              </select>
            </label>
          )}
        </div>
      </form>
      <div className="modal-footer">
        <button className="btn btn-muted" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          type="submit"
          form="react-catalog-form"
        >
          {item ? 'Salvar' : 'Cadastrar'}
        </button>
      </div>
    </dialog>
  );
}

export function CatalogScreen({ data }) {
  const { catalog, items } = data;
  const config = configs[catalog];
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState(null);
  const filtered = items.filter((item) =>
    normalize(
      [
        item.nome,
        item.descricao,
        item.observacao,
        item.observacaoServidor,
        item.identificador,
        active(item) ? 'Ativo' : 'Inativo',
      ]
        .filter(Boolean)
        .join(' '),
    ).includes(normalize(search.trim())),
  );
  const stats =
    catalog === 'servidores'
      ? [
          ['Servidores', items.length],
          [
            'Créditos disponíveis',
            number(
              items.reduce((sum, item) => sum + Number(item.creditos || 0), 0),
            ),
          ],
          [
            'Clientes',
            items.reduce(
              (sum, item) => sum + Number(item.clientesTotal || 0),
              0,
            ),
          ],
        ]
      : [
          ['Total', items.length],
          ['Ativos', items.filter(active).length],
          catalog === 'planos'
            ? [
                'Clientes ativos',
                items.reduce(
                  (sum, item) => sum + Number(item.clientes || 0),
                  0,
                ),
              ]
            : ['Inativos', items.filter((item) => !active(item)).length],
        ];
  return (
    <>
      <PanelStyles />
      <meta name="csrf-token" content={data.page.csrfToken} />
      <PanelShell data={{ ...data, currentPath: `/${catalog}` }}>
        <SiteNotice success={data.success} error={data.error} />
        <div
          className={`container page-${catalog} ui-catalog`}
          data-react-page={catalog}
        >
          <div className="ui-summary ui-summary-3">
            {stats.map(([label, value], index) => (
              <div
                className={`cli-stat accent-${['blue', 'green', 'red'][index]}`}
                key={label}
              >
                <div>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
                <div className="cli-stat-ico">
                  <Icon name={config.icon} />
                </div>
              </div>
            ))}
          </div>
          <div className="ui-toolbar">
            <input
              className="input"
              type="search"
              placeholder={`Buscar ${config.singular}...`}
              aria-label={`Buscar ${config.singular}`}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setEditor({ item: null })}
            >
              <Icon name="plus" /> Novo {config.singular}
            </button>
          </div>
          <h2>
            Catálogo de {catalog} <span>{items.length}</span>
          </h2>
          <p role="status" aria-live="polite">
            {search && `${filtered.length} resultado(s)`}
          </p>
          {!filtered.length && (
            <div className="cli-empty">
              <h3>
                {items.length
                  ? 'Nenhum resultado encontrado'
                  : `Nenhum ${config.singular} cadastrado`}
              </h3>
              <p className="muted">
                {items.length
                  ? 'Tente outro nome ou status.'
                  : 'Use o botão acima para cadastrar.'}
              </p>
            </div>
          )}
          <div className={config.grid}>
            {filtered.map((item) => (
              <article
                className={`${config.card} ${catalog === 'servidores' ? (Number(item.creditos) <= 0 ? 'srv-no-balance' : '') : !active(item) ? (catalog === 'planos' ? 'plano-inativo' : catalog === 'aplicativos' ? 'app-inativo' : 'device-inativo') : ''}`}
                key={item.id}
                data-catalog-item={item.id}
              >
                <div
                  className={
                    catalog === 'planos'
                      ? 'plano-head'
                      : catalog === 'servidores'
                        ? 'srv-head'
                        : 'disp-card-top'
                  }
                >
                  <Icon name={config.icon} />
                  <strong>{item.nome}</strong>
                  <span
                    className={`badge ${(catalog === 'servidores' ? Number(item.creditos) > 0 : active(item)) ? 'badge-green' : 'badge-muted'}`}
                  >
                    {catalog === 'servidores'
                      ? Number(item.creditos) > 0
                        ? 'Com saldo'
                        : 'Sem saldo'
                      : active(item)
                        ? 'Ativo'
                        : 'Inativo'}
                  </span>
                </div>
                {catalog === 'planos' && (
                  <div className="plano-metrics">
                    <div>
                      <span>PERÍODO</span>
                      <strong>
                        {item.periodo} {String(item.tipo).toLowerCase()}
                      </strong>
                    </div>
                    <div>
                      <span>CRÉDITOS</span>
                      <strong>{number(item.creditos)}</strong>
                    </div>
                    <div>
                      <span>CLIENTES</span>
                      <strong>{item.clientes || 0}</strong>
                    </div>
                  </div>
                )}
                {catalog === 'servidores' && (
                  <>
                    <small>{item.identificador}</small>
                    <div className="srv-stats">
                      <div className="srv-stat">
                        <span>CRÉDITOS</span>
                        <strong>{number(item.creditos)}</strong>
                      </div>
                      <div className="srv-stat">
                        <span>CLIENTES</span>
                        <strong>{item.clientesTotal || 0}</strong>
                      </div>
                      <div className="srv-stat">
                        <span>CUSTO POR CRÉDITO</span>
                        <strong>{money(item.valorCred)}</strong>
                      </div>
                    </div>
                  </>
                )}
                {catalog === 'aplicativos' && (
                  <div className="app-valor">
                    <span>Valor de renovação</span>
                    <strong>
                      {Number(item.valorRenovacao) > 0
                        ? money(item.valorRenovacao)
                        : 'Não definido'}
                    </strong>
                  </div>
                )}
                {(item.descricao ||
                  item.observacao ||
                  item.observacaoServidor) && (
                  <p
                    className={
                      catalog === 'planos'
                        ? 'plano-desc'
                        : catalog === 'servidores'
                          ? 'srv-note'
                          : catalog === 'aplicativos'
                            ? 'app-desc'
                            : 'device-desc'
                    }
                  >
                    {item.descricao ||
                      item.observacao ||
                      item.observacaoServidor}
                  </p>
                )}
                <div
                  className={
                    catalog === 'planos'
                      ? 'plano-actions'
                      : catalog === 'servidores'
                        ? 'srv-actions'
                        : 'disp-actions'
                  }
                >
                  <button
                    type="button"
                    className="btn btn-muted"
                    aria-label={`Editar ${item.nome}`}
                    onClick={() => setEditor({ item })}
                  >
                    <Icon name="edit" /> Editar
                  </button>
                  {catalog === 'servidores' && (
                    <button
                      type="button"
                      className="btn btn-muted"
                      onClick={() => setEditor({ item, focusCredit: true })}
                    >
                      Ajustar saldo
                    </button>
                  )}
                  <DeleteForm
                    catalog={catalog}
                    item={item}
                    token={data.page.csrfToken}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
        {editor && (
          <CatalogEditor
            catalog={catalog}
            {...editor}
            token={data.page.csrfToken}
            onClose={() => setEditor(null)}
          />
        )}
      </PanelShell>
      <LegacyControllers revision={catalog} nativeNavigation />
    </>
  );
}
