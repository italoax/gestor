'use client';
import { useEffect, useRef, useState } from 'react';
import { CsrfInput, Icon } from '../../../src/frontend/clients/ui.tsx';
import { PanelStyles } from '../../components/layout/PanelStyles.tsx';
import { PanelShell, SiteNotice } from '../../components/layout/PanelShell.tsx';
import { LegacyControllers } from '../../components/legacy/LegacyControllers.tsx';
import { useNativeSubmit } from '../../hooks/useNativeSubmit.ts';
import { PanelSearch } from '../../../src/frontend/components/PanelSearch.tsx';

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
      className="action-form disp-del-form"
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
        className="cli-ico-btn danger"
        aria-label={`Apagar ${item.nome}`}
      >
        <Icon name="trash" /> Excluir
      </button>
    </form>
  );
}

function CatalogEditor({
  catalog,
  item,
  focusCredit,
  token,
  onClose,
}: {
  catalog?: any;
  item?: any;
  focusCredit?: any;
  token?: string;
  onClose?: (...args: any[]) => any;
}) {
  const config = configs[catalog];
  const dialog = useRef(null);
  const submit = useNativeSubmit();
  const [tipo, setTipo] = useState(item?.tipo || 'Dias');
  const [periodo, setPeriodo] = useState(item?.periodo ?? 30);
  const [creditos, setCreditos] = useState(item?.creditos ?? 1);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement as HTMLElement;
    element.showModal();
    document.body.classList.add('modal-open');
    if (focusCredit) {
      const input = element.querySelector(
        '[name="creditos"]',
      ) as HTMLInputElement;
      input?.focus();
      input?.select();
    }
    return () => {
      element.close();
      document.body.classList.remove('modal-open');
      if (trigger?.isConnected) trigger.focus();
    };
  }, [focusCredit]);
  useEffect(() => {
    const element = dialog.current;
    element.addEventListener('gestor:submit-success', onClose);
    return () => element.removeEventListener('gestor:submit-success', onClose);
  }, [onClose]);
  function field(label, name, value, props: Record<string, any> = {}) {
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
                  onChange={(event) =>
                    setTipo((event.target as HTMLSelectElement).value)
                  }
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
                  onChange={(event) =>
                    setPeriodo((event.target as HTMLInputElement).value)
                  }
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
                  onChange={(event) =>
                    setCreditos((event.target as HTMLInputElement).value)
                  }
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
      <LegacyControllers revision={data} />
    </>
  );
}
