import { CsrfInput, Icon } from './ui.tsx';
import { opcoesRenovacao } from '../../services/renovacaoOpcoes.ts';
import { formatDateBr, formatMoney } from '../../services/format.ts';
import { addRenewalPeriod, renewalBase } from './renewalModel.ts';

function Field({
  formId,
  name,
  label,
  error,
  hint,
  children,
  full = false,
}: {
  formId?: string;
  name?: string;
  label?: React.ReactNode;
  error?: any;
  hint?: React.ReactNode;
  children?: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? 'field full' : 'field'}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      <small
        className="field-error"
        data-error-for={name}
        id={`${formId}-error-${name}`}
        aria-live="polite"
      >
        {error}
      </small>
    </label>
  );
}

function Modal({
  id,
  title,
  titleId,
  children,
  footer,
  summary,
}: {
  id?: any;
  title?: React.ReactNode;
  titleId?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  summary?: React.ReactNode;
}) {
  return (
    <div
      className="modal-overlay client-modal"
      id={id}
      aria-hidden="true"
      inert
    >
      <div className="modal">
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button
            className="modal-close"
            type="button"
            data-close-modal=""
            aria-label="Fechar"
          >
            ×
          </button>
        </div>
        {children}
        <div className="modal-footer">
          {summary}
          <button className="btn btn-muted" type="button" data-close-modal="">
            Cancelar
          </button>
          {footer}
        </div>
      </div>
    </div>
  );
}

function PaymentOptions() {
  return (
    <>
      <option value="">Selecione</option>
      <option>PIX</option>
      <option>Dinheiro</option>
      <option>Cartão</option>
    </>
  );
}

export function RenewalModals({
  renewal,
  planos,
  servidores,
  mensagens,
  csrfToken,
}: {
  renewal?: any;
  planos?: any;
  servidores?: any;
  mensagens?: any;
  csrfToken?: any;
}) {
  const { single, multi, preference, singleErrors, multiErrors } = renewal;
  const singleId = 'modal-add-pagamento-form',
    multiId = 'renovar-planos-form';
  const blocked = preference.pending || !preference.ready;
  function props(name, kind = 'single', type = 'input', required = true) {
    const state = kind === 'single' ? single : multi;
    const errors = kind === 'single' ? singleErrors : multiErrors;
    const update =
      kind === 'single' ? renewal.updateSingle : renewal.updateMulti;
    const handler = (event) => update(name, event.currentTarget.value);
    return {
      name,
      value: state[name],
      className: errors[name] ? 'input input-error' : 'input',
      'data-required': required ? '1' : undefined,
      'aria-invalid': Boolean(errors[name]),
      'aria-describedby': `${kind === 'single' ? singleId : multiId}-error-${name}`,
      onChange: type === 'select' ? handler : () => {},
      onInput: type === 'select' ? undefined : handler,
      onBlur: type === 'select' ? undefined : handler,
    };
  }
  function message(kind) {
    const id = kind === 'single' ? singleId : multiId;
    const errors = kind === 'single' ? singleErrors : multiErrors;
    const error = preference.error || errors.mensagem_pagamento_id;
    return (
      <div className="field full">
        <label htmlFor={`${id}-message`}>Mensagem após salvar</label>
        <select
          className="input"
          id={`${id}-message`}
          name="mensagem_pagamento_id"
          data-last-message-select=""
          value={preference.value}
          disabled={preference.pending}
          onChange={(event) => renewal.saveMessage(event.currentTarget.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-error-mensagem_pagamento_id`}
        >
          <option value="">Não enviar WhatsApp</option>
          {mensagens.map((m) => (
            <option key={m.id} value={m.id}>
              {m.titulo}
            </option>
          ))}
        </select>
        <small>
          {kind === 'multi'
            ? 'Enviada pelo WhatsApp após salvar. A escolha fica salva na sua conta.'
            : 'Mensagem enviada pelo WhatsApp após salvar. A última escolha vale para todos os dispositivos da sua conta.'}
        </small>
        {preference.pending && (
          <small role="status">Sincronizando mensagem…</small>
        )}
        <small
          className="field-error"
          id={`${id}-error-mensagem_pagamento_id`}
          data-error-for="mensagem_pagamento_id"
          role="alert"
        >
          {error}
        </small>
        {preference.error && (
          <button
            className="btn btn-muted"
            type="button"
            onClick={renewal.reloadMessage}
          >
            Tentar novamente
          </button>
        )}
      </div>
    );
  }
  const group = multi.escolhas.find((g) => g.selecao === multi.selecao);
  const option = group?.opcoes.find(
    (o) => Number(o.periodos) === Number(multi.periodos),
  );
  const itemDuration = (item, count) =>
    opcoesRenovacao(item, item.valor).find(
      (entry) => entry.periodos === Number(count),
    )?.label;
  const durationLabel = (count) => {
    const labels = [
      ...new Set<string>(
        group.dados.itens.map((item) => itemDuration(item, count)),
      ),
    ];
    return labels.length === 1 && labels[0]
      ? labels[0]
      : `${count} ${Number(count) === 1 ? 'período' : 'períodos'} por servidor`;
  };
  const missingCatalog = single.id && (!single.plano || !single.servidor);
  return (
    <>
      <Modal
        id="modal-add-pagamento"
        titleId="pagamento-title"
        title={single.id ? `↻ Renovar - ${single.nome}` : '↻ Renovar Pagamento'}
        footer={
          <button
            className="btn btn-primary"
            type="submit"
            form={singleId}
            disabled={blocked || !single.id || renewal.submitting.single}
          >
            {renewal.submitting.single ? 'Renovando…' : 'Renovar'}
          </button>
        }
      >
        <form
          method="post"
          action="/clientes"
          id={singleId}
          ref={renewal.singleRef}
          className="modal-body"
          data-native-submit="1"
          noValidate
          onSubmit={(event) => renewal.validate(event, 'single')}
        >
          <CsrfInput token={csrfToken} />
          <input type="hidden" name="action" value="add_pagamento" />
          <input type="hidden" name="id" value={single.id} />
          <div
            className="modal-error"
            id="modal-add-pagamento-error"
            aria-live="polite"
          >
            {missingCatalog
              ? 'Este cliente está sem plano e/ou servidor. Preencha os campos abaixo antes de renovar.'
              : Object.keys(singleErrors).length
                ? 'Revise os campos obrigatórios destacados.'
                : ''}
          </div>
          <div className="form-grid">
            <Field
              formId={singleId}
              name="vencimento"
              label="Nova data de vencimento *"
              error={singleErrors.vencimento}
            >
              <input
                {...props('vencimento')}
                type="text"
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                pattern="\d{2}/\d{2}/\d{4}"
                title="Use dd/mm/aaaa"
                data-date-mask=""
              />
            </Field>
            <Field
              formId={singleId}
              name="hora_vencimento"
              label="Nova hora de vencimento"
              error={singleErrors.hora_vencimento}
            >
              <input
                {...props('hora_vencimento', 'single', 'input', false)}
                type="time"
              />
            </Field>
            <Field
              formId={singleId}
              name="plano"
              label="Plano *"
              error={singleErrors.plano}
              hint="Ao trocar o plano, confira o valor do período completo abaixo."
            >
              <select
                {...props('plano', 'single', 'select')}
                data-renovacao-plano=""
              >
                <option value="">Selecione</option>
                {planos
                  .filter((p) => p.ativo)
                  .map((p) => (
                    <option key={p.id} value={p.nome}>
                      {p.nome}
                    </option>
                  ))}
                {single.originalPlan?.nome &&
                  !planos.some(
                    (p) => p.ativo && p.nome === single.originalPlan.nome,
                  ) && (
                    <option value={single.originalPlan.nome}>
                      {single.originalPlan.nome} (atual)
                    </option>
                  )}
              </select>
            </Field>
            <Field
              formId={singleId}
              name="servidor"
              label="Servidor *"
              error={singleErrors.servidor}
              hint="Os créditos serão descontados do servidor selecionado."
            >
              <select
                {...props('servidor', 'single', 'select')}
                data-renovacao-servidor=""
              >
                <option value="">Selecione</option>
                {servidores.map((s) => (
                  <option key={s.id} value={s.nome}>
                    {s.nome}
                  </option>
                ))}
                {single.originalServer?.nome &&
                  !servidores.some(
                    (s) => s.nome === single.originalServer.nome,
                  ) && (
                    <option value={single.originalServer.nome}>
                      {single.originalServer.nome} (atual)
                    </option>
                  )}
              </select>
            </Field>
            <Field
              formId={singleId}
              name="valor"
              label="Valor *"
              error={singleErrors.valor}
              hint="Quantidade de renovações × preço do período completo. Pode editar para dar desconto."
            >
              <input
                {...props('valor')}
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
              />
            </Field>
            <Field
              formId={singleId}
              name="forma_pagamento"
              label="Forma de pagamento *"
              error={singleErrors.forma_pagamento}
            >
              <select {...props('forma_pagamento', 'single', 'select')}>
                <PaymentOptions />
              </select>
            </Field>
            <Field
              formId={singleId}
              name="pago_em"
              label="Pago em"
              error={singleErrors.pago_em}
            >
              <input
                {...props('pago_em', 'single', 'input', false)}
                type="text"
                placeholder="dd/mm/aaaa"
                inputMode="numeric"
                autoComplete="off"
                maxLength={10}
                pattern="\d{2}/\d{2}/\d{4}"
                title="Use dd/mm/aaaa"
                data-date-mask=""
              />
            </Field>
            <Field
              formId={singleId}
              name="creditos_gastos"
              label="Quantidade de renovações"
              error={singleErrors.creditos_gastos}
              hint={
                <>
                  Cada renovação corresponde a um período completo do plano. O
                  valor cadastrado do cliente é o preço desse período.
                  <br />
                  <span data-renovacao-periodo="">{single.summary}</span>
                </>
              }
            >
              <input
                {...props('creditos_gastos')}
                type="number"
                min="1"
                step="1"
                data-creditos-input=""
              />
            </Field>
            <input
              type="hidden"
              name="telas"
              value={single.telas}
              data-telas-input=""
            />
            <Field
              formId={singleId}
              name="custo_pagamento"
              label="Custo"
              error={singleErrors.custo_pagamento}
              hint="Telas × renovações × créditos do plano × custo por crédito."
            >
              <input
                {...props('custo_pagamento', 'single', 'input', false)}
                type="number"
                min="0"
                step="0.01"
                placeholder="auto"
                data-custo-input=""
              />
            </Field>
            <label className="field full">
              <span>Observação</span>
              <textarea
                {...props('observacao_pagamento', 'single', 'input', false)}
                placeholder="Anotações sobre essa renovação..."
              />
            </label>
            {message('single')}
          </div>
        </form>
      </Modal>
      <Modal
        id="modal-renovar-planos"
        title="Renovar servidores"
        summary={
          <div className="renewal-total" aria-live="polite" aria-atomic="true">
            <div>
              <strong>Total da renovação</strong>
              <small>
                {group?.dados.itens.length || 0}{' '}
                {group?.dados.itens.length === 1
                  ? 'servidor selecionado'
                  : 'servidores selecionados'}
              </small>
            </div>
            <strong data-multi-total="">
              {option ? formatMoney(option.valor) : '—'}
            </strong>
          </div>
        }
        footer={
          <button
            className="btn btn-primary"
            type="submit"
            form={multiId}
            disabled={
              blocked ||
              multi.loading ||
              Boolean(multi.error) ||
              !multi.chave ||
              renewal.submitting.multi
            }
          >
            {renewal.submitting.multi ? 'Renovando…' : 'Confirmar renovação'}
          </button>
        }
      >
        <form
          method="post"
          action="/clientes"
          id={multiId}
          ref={renewal.multiRef}
          className="modal-body"
          data-native-submit="1"
          noValidate
          onSubmit={(event) => renewal.validate(event, 'multi')}
        >
          <CsrfInput token={csrfToken} />
          <input type="hidden" name="action" value="renovar_planos" />
          <input type="hidden" name="id" value={multi.id} />
          <input type="hidden" name="chave" value={multi.chave} />
          <div className="renewal-customer">
            <span className="renewal-customer-icon">
              <Icon name="users" />
            </span>
            <div>
              <small>Renovação de assinatura</small>
              <strong data-multi-nome="">{multi.nome}</strong>
            </div>
          </div>
          <p
            data-multi-erro=""
            role="alert"
            hidden={
              !multi.loading && !multi.error && !Object.keys(multiErrors).length
            }
          >
            {multi.loading
              ? 'Carregando planos…'
              : multi.error ||
                (Object.keys(multiErrors).length
                  ? 'Revise os campos obrigatórios destacados.'
                  : '')}
          </p>
          <div className="form-grid">
            <Field
              formId={multiId}
              full
              name="selecao"
              label="Servidores para renovar"
              error={multiErrors.selecao}
            >
              <select
                {...props('selecao', 'multi', 'select')}
                disabled={multi.loading}
              >
                {multi.escolhas.map((g) => (
                  <option key={g.selecao} value={g.selecao}>
                    {g.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              formId={multiId}
              full
              name="periodos"
              label="Duração da renovação"
              error={multiErrors.periodos}
            >
              <select
                {...props('periodos', 'multi', 'select')}
                disabled={multi.loading}
              >
                {group?.opcoes.map((o) => (
                  <option key={o.periodos} value={o.periodos}>
                    {durationLabel(o.periodos)} · {formatMoney(o.valor)}
                  </option>
                ))}
              </select>
            </Field>
            <div
              className="field full renewal-summary"
              data-multi-resumo=""
              aria-live="polite"
              aria-atomic="true"
            >
              {option && <h4>Resumo da renovação</h4>}
              {option &&
                group.dados.itens.map((item, index) => (
                  <article
                    className="renewal-server"
                    key={`${item.servidor}-${index}`}
                  >
                    <div className="renewal-server-heading">
                      <strong>{item.servidor}</strong>
                      <strong>
                        {formatMoney(item.valor * option.periodos)}
                      </strong>
                    </div>
                    <p className="renewal-server-plan">
                      {item.plano} · {itemDuration(item, option.periodos)}
                    </p>
                    <div className="renewal-server-date">
                      <span>
                        <Icon name="calendar" /> Novo vencimento
                      </span>
                      <strong>
                        {formatDateBr(
                          addRenewalPeriod(
                            renewalBase(item.vencimento),
                            item.periodo,
                            item.tipo,
                            option.periodos,
                          ),
                        )}
                      </strong>
                    </div>
                  </article>
                ))}
            </div>
            <Field
              formId={multiId}
              full
              name="forma_pagamento"
              label="Forma de pagamento"
              error={multiErrors.forma_pagamento}
            >
              <select {...props('forma_pagamento', 'multi', 'select')}>
                <PaymentOptions />
              </select>
            </Field>
            {message('multi')}
          </div>
          <p className="muted renewal-note">
            A renovação começa no vencimento atual. Se já venceu, começa hoje.
          </p>
        </form>
      </Modal>
    </>
  );
}
