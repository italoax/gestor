'use client';
import { useEffect, useRef, useState } from 'react';
import { CsrfInput, Icon } from '../../../../src/frontend/clients/ui.tsx';
import { PanelStyles } from '../../components/layout/PanelStyles.tsx';
import { PanelShell, SiteNotice } from '../../components/layout/PanelShell.tsx';
import { LegacyControllers } from '../../components/legacy/LegacyControllers.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';
import { PanelSearch } from '../../../../src/frontend/components/PanelSearch.tsx';

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

function DeleteForm({
  catalog,
  item,
  token,
}: {
  catalog?: any;
  item?: any;
  token?: string;
}) {
  const submit = useNativeSubmit(`Deseja apagar ${item.nome}?`);
  return (
    <form
      className={`action-form ${catalog === 'servidores' ? 'srv-act-form' : catalog === 'planos' ? 'plano-del-form' : 'disp-del-form'}`}
      method="post"
      action={`/${catalog}`}
      onSubmit={submit}
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
        className={
          catalog === 'servidores' ? 'srv-act danger' : 'cli-ico-btn danger'
        }
        aria-label={`Apagar ${item.nome}`}
        title={`Excluir ${item.nome}`}
      >
        <Icon name="trash" />
        Excluir
      </button>
    </form>
  );
}

function CatalogEditor({
  catalog,
  item,
  token,
  onClose,
}: {
  catalog?: any;
  item?: any;
  token?: string;
  onClose?: (...args: any[]) => any;
}) {
  const config = configs[catalog];
  const compact = [
    'planos',
    'servidores',
    'aplicativos',
    'dispositivos',
  ].includes(catalog);
  const dialog = useRef(null);
  const submit = useNativeSubmit();
  const [tipo, setTipo] = useState(item?.tipo || 'Dias');
  const [periodo, setPeriodo] = useState(item?.periodo ?? 30);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement as HTMLElement;
    element.showModal();
    document.body.classList.add('modal-open');
    return () => {
      element.close();
      document.body.classList.remove('modal-open');
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  useEffect(() => {
    const element = dialog.current;
    element.addEventListener('gestor:submit-success', onClose);
    return () => element.removeEventListener('gestor:submit-success', onClose);
  }, [onClose]);
  function field(label, name, value, props: Record<string, any> = {}) {
    return (
      <label className={`field ${compact && name === 'nome' ? 'full' : ''}`}>
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
  const statusField = (
    <label className={`field ${catalog === 'aplicativos' ? '' : 'full'}`}>
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
  );
  return (
    <dialog
      ref={dialog}
      className={`modal react-catalog-dialog ${compact ? 'catalog-editor' : ''} ${catalog === 'planos' ? 'plan-editor' : catalog === 'servidores' ? 'server-editor' : catalog === 'aplicativos' ? 'app-editor' : catalog === 'dispositivos' ? 'device-editor' : ''}`}
      style={{
        width: `min(${compact ? 520 : 600}px, calc(100vw - 24px))`,
        maxHeight: '90dvh',
        overflow: compact ? 'hidden' : 'auto',
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
          {`${item ? 'Editar' : 'Novo'} ${compact ? config.singular : config.label}`}
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
        onSubmit={submit}
      >
        <CsrfInput token={token} />
        <input
          type="hidden"
          name="action"
          value={`${item ? 'update' : 'create'}_${config.singular}`}
        />
        <input type="hidden" name="id" value={item?.id ?? ''} />
        <div className="form-grid">
          {field(
            compact
              ? `Nome do ${config.singular} *`
              : `Nome do ${config.label} *`,
            'nome',
            item?.nome,
            {
              required: true,
              ...(catalog === 'planos'
                ? {
                    maxLength: 120,
                    pattern: '.*\\S.*',
                    placeholder: 'Ex.: Mensal',
                  }
                : {}),
            },
          )}
          {catalog === 'planos' && (
            <>
              <input
                type="hidden"
                name="observacao"
                value={item?.observacao ?? ''}
              />
              <input
                type="hidden"
                name="sigma_package_id"
                value={item?.sigmaPackageId ?? ''}
              />
              <input
                type="hidden"
                name="sigma_connections"
                value={item?.sigmaConnections || 1}
              />
              <label className="field">
                <span>Unidade *</span>
                <select
                  className="input"
                  name="tipo"
                  value={tipo}
                  onChange={(event) =>
                    setTipo((event.target as HTMLSelectElement).value)
                  }
                >
                  <option>Dias</option>
                  <option>Meses</option>
                </select>
              </label>
              <label className="field">
                <span>Duração *</span>
                <input
                  className="input"
                  type="number"
                  name="periodo"
                  min="1"
                  max="2147483647"
                  step="1"
                  required
                  value={periodo}
                  onChange={(event) =>
                    setPeriodo((event.target as HTMLInputElement).value)
                  }
                />
              </label>
              <label className="field full">
                <span>Créditos *</span>
                <input
                  className="input"
                  type="number"
                  name="creditos"
                  min="0"
                  max="9999999999.99"
                  step="0.01"
                  required
                  defaultValue={item?.creditos ?? 1}
                />
              </label>
              <label className="switch-field full">
                <span>Ativado</span>
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
                'Custo por crédito (R$)',
                'valor_cred',
                item?.valorCred ?? 2,
                { type: 'number', step: '0.01' },
              )}
            </>
          )}
          {catalog === 'aplicativos' &&
            field(
              'Renovação (R$)',
              'valor_renovacao',
              item?.valorRenovacao ?? 0,
              { type: 'number', step: '0.01', min: 0 },
            )}
          {catalog === 'aplicativos' && statusField}
          {catalog !== 'planos' && (
            <label className="field full">
              <span>
                {catalog === 'servidores' ? 'Observações' : 'Descrição'}
              </span>
              <textarea
                className="input"
                rows={compact ? 2 : undefined}
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
          )}
          {catalog === 'dispositivos' && statusField}
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

export function CatalogScreen({ data }: { data?: any }) {
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
          <div className="ui-toolbar">
            <PanelSearch
              placeholder={`Buscar ${config.singular}...`}
              label={`Buscar ${config.singular}`}
              value={search}
              onChange={setSearch}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => setEditor({ item: null })}
            >
              <Icon name="plus" /> Novo {config.singular}
            </button>
          </div>
          <p
            className="panel-search-results"
            role="status"
            aria-live="polite"
            hidden={!search.trim()}
          >
            {search.trim() && `${filtered.length} resultado(s)`}
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
          <div className={`catalog-grid ${config.grid}`}>
            {filtered.map((item) => (
              <article
                className={`catalog-card ${config.card} ${catalog === 'servidores' ? (Number(item.creditos) <= 0 ? 'srv-no-balance' : '') : !active(item) ? (catalog === 'planos' ? 'plano-inativo' : catalog === 'aplicativos' ? 'app-inativo' : 'device-inativo') : ''}`}
                key={item.id}
                data-catalog-item={item.id}
              >
                <div
                  className={`catalog-card-head ${
                    catalog === 'planos'
                      ? 'plano-head'
                      : catalog === 'servidores'
                        ? 'srv-head'
                        : 'disp-card-top'
                  }`}
                >
                  <span className="catalog-card-icon">
                    <Icon name={config.icon} />
                  </span>
                  <div className="catalog-card-title">
                    <strong>{item.nome}</strong>
                    {catalog === 'servidores' && item.identificador && (
                      <small>{item.identificador}</small>
                    )}
                  </div>
                  <span
                    className={`catalog-card-status ${
                      catalog === 'servidores'
                        ? 'srv-balance-badge'
                        : `badge ${active(item) ? 'badge-green' : 'badge-muted'}`
                    }`}
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
                  <div className="catalog-card-metrics plano-metrics">
                    <div>
                      <span>Duração</span>
                      <strong>
                        {item.periodo}{' '}
                        {String(item.tipo).toLowerCase() === 'meses'
                          ? Number(item.periodo) === 1
                            ? 'mês'
                            : 'meses'
                          : Number(item.periodo) === 1
                            ? 'dia'
                            : 'dias'}
                      </strong>
                    </div>
                    <div>
                      <span title="Créditos usados por renovação">
                        Créditos
                      </span>
                      <strong>{number(item.creditos)}</strong>
                    </div>
                    <div>
                      <span>Clientes</span>
                      <strong>{item.clientes || 0}</strong>
                    </div>
                  </div>
                )}
                {catalog === 'servidores' && (
                  <>
                    <div className="catalog-card-metrics srv-stats">
                      <div className="srv-stat">
                        <span>Créditos</span>
                        <strong className="srv-cred">
                          {number(item.creditos)}
                        </strong>
                      </div>
                      <div className="srv-stat">
                        <span>Clientes</span>
                        <strong>{item.clientesTotal || 0}</strong>
                      </div>
                      <div className="srv-stat">
                        <span>Custo por crédito</span>
                        <strong>{money(item.valorCred)}</strong>
                      </div>
                    </div>
                  </>
                )}
                {catalog === 'aplicativos' && (
                  <div
                    className="catalog-card-summary app-valor"
                    data-defined={Number(item.valorRenovacao) > 0}
                  >
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
                    className={`catalog-card-description ${
                      catalog === 'planos'
                        ? 'plano-desc'
                        : catalog === 'servidores'
                          ? 'srv-note'
                          : catalog === 'aplicativos'
                            ? 'app-desc'
                            : 'device-desc'
                    }`}
                  >
                    {item.descricao ||
                      item.observacao ||
                      item.observacaoServidor}
                  </p>
                )}
                <div
                  className={`catalog-card-actions ${
                    catalog === 'planos'
                      ? 'plano-actions'
                      : catalog === 'servidores'
                        ? 'srv-actions'
                        : 'disp-actions'
                  }`}
                >
                  <button
                    type="button"
                    className={
                      catalog === 'servidores'
                        ? 'srv-act'
                        : catalog === 'planos'
                          ? 'btn btn-muted plano-edit'
                          : 'btn btn-muted disp-edit'
                    }
                    aria-label={`Editar ${item.nome}`}
                    onClick={() => setEditor({ item })}
                  >
                    <Icon name="edit" /> Editar
                  </button>
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
      <LegacyControllers revision={data} />
    </>
  );
}
