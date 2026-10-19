import { Icon, CsrfInput, StatusBadge } from './ui.tsx';
import {
  formatMoney,
  formatDateBr,
  formatDateInput,
  statusByVencimento,
  statusUrgency,
} from '../../services/format.ts';

export function ClientRow({
  c,
  planos,
  servidores,
  sortNow,
  selected,
  selectRow,
  matches,
  csrfToken,
  verArquivados,
}: {
  c?: any;
  planos?: any;
  servidores?: any;
  sortNow?: any;
  selected?: any;
  selectRow?: any;
  matches?: any;
  csrfToken?: any;
  verArquivados?: any;
}) {
  const cStatus = statusByVencimento(c.status, c.vencimento, sortNow);
  const servidorAtual = servidores.find((s) => s.nome === c.servidor);
  const planoAtual = planos.find((p) => p.nome === c.plano);
  return (
    <tr
      className={[
        !matches(c) ? 'hidden' : '',
        selected.has(c.id) ? 'is-selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-search-item=""
      data-id={c.id}
      data-vencimento-status={cStatus.type}
      data-search-text={[
        c.nome,
        c.user,
        c.telefone,
        c.email,
        c.plano,
        c.adicional?.plano,
        c.adicional?.servidor,
        c.servidor,
        c.aplicativo,
        c.adicional?.aplicativo,
        c.idPainel,
      ]
        .filter(Boolean)
        .join(' ')}
      data-sort-nome={c.nome || ''}
      data-sort-whatsapp={c.telefone || ''}
      data-sort-plano={c.plano || ''}
      data-sort-valor={Number(c.valor || 0) + Number(c.adicional?.valor || 0)}
      data-sort-servidor={c.servidor || ''}
      data-sort-aplicativo={c.aplicativo || ''}
      data-sort-vencimento={formatDateInput(c.vencimento)}
      data-sort-status={statusUrgency(c.status, c.vencimento, sortNow)}
    >
      <td className="col-check">
        <input
          type="checkbox"
          className="cli-check"
          aria-label={`Selecionar ${c.nome}`}
          checked={selected.has(c.id)}
          onChange={(event) =>
            selectRow(c.id, (event.target as HTMLInputElement).checked)
          }
        />
      </td>
      <td className="cli-c-nome">
        <strong>{c.nome}</strong>
        <span className="hidden-search">
          {c.user || ''}
          {c.email || ''}
          {c.telefone}
        </span>
        {c.idPainel ? (
          <>
            <small className="cli-id">
              {c.idPainel}
              <button
                type="button"
                className="cli-copy"
                data-copy={c.idPainel}
                title="Copiar ID"
              >
                ⧉
              </button>
            </small>
          </>
        ) : c.user ? (
          <>
            <small>{c.user}</small>
          </>
        ) : null}

        <div className="cli-m" aria-hidden="true">
          <div className="cli-m-head">
            <div className="cli-m-name">
              <strong>{c.nome}</strong>
              {c.user || c.idPainel ? (
                <>
                  <small>{c.idPainel || c.user}</small>
                </>
              ) : null}
            </div>
            <div className="cli-m-price">
              {formatMoney(
                Number(c.valor || 0) + Number(c.adicional?.valor || 0),
              )}
            </div>
          </div>
          <div className="cli-m-meta">
            <span className={`cli-m-pill cli-m-status status-${cStatus.type}`}>
              {cStatus.label || cStatus.type}
            </span>
            <span className="cli-m-dot">·</span>
            <span className="cli-m-venc">
              <Icon name="calendar" />
              {formatDateBr(c.vencimento)}
            </span>
            {c.telefone ? (
              <>
                <span className="cli-m-dot">·</span>
                <span className="cli-m-tel">
                  <Icon name="phone" />
                  {c.telefone}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </td>
      <td>
        <span className="cli-wpp">{c.telefone}</span>
      </td>
      <td className="cli-access-cell">
        <div className="cli-access-line">{c.plano || '-'}</div>
        {c.adicional ? (
          <>
            <div className="cli-access-line">{c.adicional.plano || '-'}</div>
          </>
        ) : null}
      </td>
      <td className="cli-price-cell">
        <strong className="cli-price-total">
          {formatMoney(Number(c.valor || 0) + Number(c.adicional?.valor || 0))}
        </strong>
        {c.adicional ? (
          <>
            <small className="cli-price-label">Total dos 2 acessos</small>
            <small className="cli-price-part">1 ·{formatMoney(c.valor)}</small>
            <small className="cli-price-part">
              2 ·{formatMoney(c.adicional.valor)}
            </small>
          </>
        ) : null}
      </td>
      <td className="cli-access-cell">
        <div className="cli-access-line">
          {c.adicional ? (
            <>
              <span className="cli-access-number" title="Acesso principal">
                1
              </span>
            </>
          ) : null}
          <span>{c.servidor || '-'}</span>
        </div>
        {c.adicional ? (
          <>
            <div className="cli-access-line">
              <span className="cli-access-number" title="Acesso adicional">
                2
              </span>
              <span>{c.adicional.servidor || '-'}</span>
            </div>
          </>
        ) : null}
      </td>
      <td className="cli-app-cell cli-access-cell">
        <div className="cli-access-line">
          <span className="cli-app-name">
            <Icon name="phone" />
            {c.aplicativo || '-'}
          </span>
        </div>
        {c.adicional ? (
          <>
            <div className="cli-access-line">
              <span className="cli-app-name">
                <Icon name="phone" />
                {c.adicional.aplicativo || '-'}
              </span>
            </div>
          </>
        ) : null}
      </td>
      <td className="cli-venc">
        <div className="cli-expiry-access">
          <span className="cli-expiry-date">{formatDateBr(c.vencimento)}</span>
          {c.horaVencimento ? (
            <>
              <small className="cli-expiry-time">
                às
                {String(c.horaVencimento).slice(0, 5)}
              </small>
            </>
          ) : null}
        </div>
        {c.adicional ? (
          <>
            <div className="cli-expiry-access">
              <span className="cli-expiry-date">
                {formatDateBr(c.adicional.vencimento)}
              </span>
            </div>
          </>
        ) : null}
      </td>
      <td>
        <StatusBadge status={cStatus} />
      </td>
      <td className="col-acoes">
        <div className="cli-acoes">
          <button
            className={`cli-ico-btn ${c.adicional ? 'open-multi-payment' : 'open-payment'}`}
            type="button"
            title="Renovar"
            data-id={c.id}
            data-nome={c.nome}
            data-vencimento={formatDateBr(c.vencimento)}
            data-plano={c.plano}
            data-creditos-plano={planoAtual?.creditoGastos || 1}
            data-periodo={planoAtual?.periodo || 30}
            data-tipo-periodo={planoAtual?.tipo || 'Dias'}
            data-valor={c.valor}
            data-servidor={c.servidor || ''}
            data-telas={c.telas}
            data-creditos={c.creditosGastos || 0}
            data-valor-cred={servidorAtual?.valorCred || 0}
            data-hora={c.horaVencimento || '23:59'}
          >
            ↻
          </button>
          <div className="cli-menu">
            <button
              className="cli-ico-btn cli-menu-btn"
              type="button"
              aria-haspopup="menu"
              aria-expanded="false"
              title="Mais ações"
              aria-label={`Ações de ${c.nome}`}
            >
              <Icon name="more" />
            </button>
            <div
              className="cli-menu-pop"
              role="menu"
              aria-label="Ações do cliente"
              hidden
            >
              <button
                className="cli-menu-item"
                type="button"
                role="menuitem"
                data-act="msg"
              >
                <span className="cli-menu-icon">
                  <Icon name="message" />
                </span>
                <span>Enviar mensagem</span>
              </button>
              <button
                className="cli-menu-item"
                type="button"
                role="menuitem"
                data-act="edit"
              >
                <span className="cli-menu-icon">
                  <Icon name="edit" />
                </span>
                <span>Editar</span>
              </button>
              <button
                className="cli-menu-item"
                type="button"
                data-client-access={c.id}
                role="menuitem"
              >
                <span className="cli-menu-icon">
                  <Icon name="key" />
                </span>
                <span>Acesso do cliente</span>
              </button>
              {verArquivados && (
                <button
                  className="cli-menu-item"
                  type="button"
                  data-act="unarchive"
                  role="menuitem"
                >
                  <span className="cli-menu-icon">
                    <Icon name="archive" />
                  </span>
                  <span>Desarquivar</span>
                </button>
              )}
              <div className="cli-menu-sep" role="separator"></div>
              <button
                className="cli-menu-item danger"
                type="button"
                data-act="delete"
                role="menuitem"
              >
                <span className="cli-menu-icon">
                  <Icon name="trash" />
                </span>
                <span>Excluir</span>
              </button>
            </div>
          </div>
          <div className="cli-hidden-actions" hidden>
            <button
              className="open-whatsapp-message"
              type="button"
              data-id={c.id}
              data-nome={c.nome}
              data-user={c.user}
              data-telefone={c.telefone}
              data-vencimento={formatDateBr(c.vencimento)}
              data-plano={c.plano}
              data-valor={formatMoney(c.valor)}
              data-servidor={c.servidor}
            ></button>
            <button
              className="edit-cliente"
              type="button"
              data-adicional={JSON.stringify(c.adicional || null)}
              data-id={c.id}
              data-nome={c.nome}
              data-user={c.user}
              data-telefone={c.telefone}
              data-vencimento={formatDateInput(c.vencimento)}
              data-plano={c.plano}
              data-valor={c.valor}
              data-status={c.status}
              data-servidor={c.servidor}
              data-telas={c.telas}
              data-creditos={c.creditosGastos || 0}
              data-forma-pagamento={c.formaPagamento || ''}
              data-id-painel={c.idPainel || ''}
              data-email={c.email || ''}
              data-captacao={c.captacao || ''}
              data-aniversario={formatDateInput(c.aniversario)}
              data-link-m3u={c.linkM3u || ''}
              data-time-cliente={c.timeCliente || ''}
              data-telefone-secundario={c.telefoneSecundario || ''}
              data-observacoes={c.observacoes || ''}
              data-data-inicio={formatDateInput(c.dataInicio)}
              data-hora-vencimento={c.horaVencimento || ''}
              data-dispositivo={c.dispositivo || ''}
              data-aplicativo={c.aplicativo || ''}
              data-pontos={c.pontosFidelidade || 0}
              data-sigma-customer-id={c.sigmaCustomerId || ''}
            ></button>
            <form
              method="post"
              action="/clientes"
              className="delete-cliente"
              data-native-submit="1"
            >
              <CsrfInput token={csrfToken} />
              <input
                type="hidden"
                name="action"
                defaultValue="delete_cliente"
              />
              <input type="hidden" name="id" defaultValue={c.id} />
              <button type="submit"></button>
            </form>
            {verArquivados && (
              <form
                method="post"
                action="/clientes"
                className="unarchive-cliente"
              >
                <CsrfInput token={csrfToken} />
                <input
                  type="hidden"
                  name="action"
                  defaultValue="desarquivar_cliente"
                />
                <input type="hidden" name="id" defaultValue={c.id} />
                <button type="submit"></button>
              </form>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}
