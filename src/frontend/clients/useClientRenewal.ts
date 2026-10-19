import { useEffect, useRef, useState } from 'react';
import { formatDateBr, normalizeDateInput } from '../../services/format.ts';
import {
  calculateRenewal,
  multiRenewalDates,
  renewalBase,
  todayInSaoPaulo,
} from './renewalModel.ts';
import { createPaymentPreferenceClient } from './paymentPreference.ts';

const emptySingle = {
  id: '',
  nome: '',
  plano: '',
  servidor: '',
  valor: '',
  custo_pagamento: '',
  vencimento: '',
  hora_vencimento: '23:59',
  pago_em: '',
  creditos_gastos: '1',
  telas: '1',
  forma_pagamento: 'PIX',
  observacao_pagamento: '',
  summary: '',
  base: '',
  basePrice: 0,
};
const emptyMulti = {
  id: '',
  nome: '',
  escolhas: [],
  chave: '',
  selecao: '',
  periodos: '',
  forma_pagamento: '',
  vencimento_principal: '',
  vencimento_adicional: '',
  loading: false,
  error: '',
};
const emptyPreference = { value: '', pending: false, ready: false, error: '' };

export function useClientRenewal({ planos, servidores, mensagens, csrfToken }) {
  const singleRef = useRef(null),
    multiRef = useRef(null);
  const [single, setSingle] = useState(emptySingle);
  const [multi, setMulti] = useState(emptyMulti);
  const [singleErrors, setSingleErrors] = useState({});
  const [multiErrors, setMultiErrors] = useState({});
  const [preference, setPreference] = useState(emptyPreference);
  const [submitting, setSubmitting] = useState({ single: false, multi: false });
  const submittingRef = useRef({ single: false, multi: false });
  const preferenceClient = useRef(null),
    plansRequest = useRef(null),
    revision = useRef(0);
  const ensurePreference = () => {
    if (!preferenceClient.current)
      preferenceClient.current = createPaymentPreferenceClient({
        messages: mensagens,
        csrfToken,
        onState: (state) => {
          setPreference(state);
          if (state.ready) {
            const clear = (previous) => {
              if (!previous.mensagem_pagamento_id) return previous;
              const next = { ...previous };
              delete next.mensagem_pagamento_id;
              return next;
            };
            setSingleErrors(clear);
            setMultiErrors(clear);
          }
        },
      });
    return preferenceClient.current;
  };
  useEffect(() => {
    const finished = (event: Event) => {
      const kind =
        event.target === singleRef.current
          ? 'single'
          : event.target === multiRef.current
            ? 'multi'
            : undefined;
      if (!kind) return;
      submittingRef.current = { ...submittingRef.current, [kind]: false };
      setSubmitting(submittingRef.current);
    };
    document.addEventListener('gestor:submit-finished', finished);
    return () =>
      document.removeEventListener('gestor:submit-finished', finished);
  }, []);
  useEffect(() => {
    const onFocus = () => {
      const open = ['modal-add-pagamento', 'modal-renovar-planos'].some(
        (id) =>
          (document.getElementById(id) as HTMLElement)?.getAttribute(
            'aria-hidden',
          ) === 'false',
      );
      if (open && !preferenceClient.current?.getState().pending)
        void ensurePreference().load();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      revision.current++;
      plansRequest.current?.abort();
      preferenceClient.current?.dispose();
      preferenceClient.current = null;
    };
  }, [mensagens, csrfToken]);

  function openModal(id) {
    submittingRef.current = { single: false, multi: false };
    setSubmitting(submittingRef.current);
    const other =
      id === 'modal-add-pagamento'
        ? 'modal-renovar-planos'
        : 'modal-add-pagamento';
    window.gestorSetModalState?.(
      document.getElementById(other) as HTMLElement,
      false,
    );
    window.gestorSetModalState?.(
      document.getElementById(id) as HTMLElement,
      true,
    );
  }
  function openSingle(button) {
    revision.current++;
    plansRequest.current?.abort();
    singleRef.current
      ?.querySelectorAll('input')
      .forEach((input) => input.setCustomValidity(''));
    const data = button.dataset;
    const next = {
      ...emptySingle,
      id: data.id || '',
      nome: data.nome || '',
      plano: data.plano || '',
      servidor: data.servidor || '',
      base: renewalBase(data.vencimento),
      basePrice: Number(data.valor) || 0,
      telas: data.telas || '1',
      hora_vencimento: (data.hora || '23:59').slice(0, 5),
      pago_em: formatDateBr(todayInSaoPaulo()),
      originalPlan: {
        nome: data.plano,
        periodo: Number(data.periodo) || 30,
        tipo: data.tipoPeriodo || 'Dias',
        creditoGastos: Number(data.creditosPlano) || 1,
      },
      originalServer: {
        nome: data.servidor,
        valorCred: Number(data.valorCred) || 0,
      },
    };
    setSingle(calculateRenewal(next, planos, servidores));
    setSingleErrors({});
    void ensurePreference().load();
    openModal('modal-add-pagamento');
  }
  async function openMulti(button) {
    const current = ++revision.current;
    plansRequest.current?.abort();
    const controller = new AbortController();
    plansRequest.current = controller;
    setMulti({
      ...emptyMulti,
      id: button.dataset.id,
      nome: button.dataset.nome,
      loading: true,
    });
    setMultiErrors({});
    void ensurePreference().load();
    openModal('modal-renovar-planos');
    try {
      const response = await fetch(
        '/clientes/' +
          encodeURIComponent(button.dataset.id) +
          '/planos-renovacao',
        {
          cache: 'no-store',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        },
      );
      if (!response.ok)
        throw new Error(
          'Não foi possível carregar os planos. Reabra a renovação.',
        );
      const data = await response.json();
      if (
        !data.chave ||
        !data.escolhas?.length ||
        !data.escolhas.every(
          (group) => group.opcoes?.length && group.dados?.itens?.length,
        )
      )
        throw new Error(
          'Não foi possível carregar os planos. Reabra a renovação.',
        );
      if (current !== revision.current) return;
      setMulti((previous) => ({
        ...previous,
        escolhas: data.escolhas,
        chave: data.chave,
        selecao: data.escolhas[0].selecao,
        periodos: String(data.escolhas[0].opcoes[0].periodos),
        ...multiRenewalDates(
          data.escolhas[0],
          data.escolhas[0].opcoes[0].periodos,
        ),
        loading: false,
      }));
    } catch (error) {
      if (current === revision.current)
        setMulti((previous) => ({
          ...previous,
          loading: false,
          error: 'Não foi possível carregar os planos. Reabra a renovação.',
        }));
    }
  }
  function onPageClick(event) {
    const button = (event.target as HTMLElement).closest(
      'button',
    ) as HTMLButtonElement;
    if (button?.matches('.open-payment')) openSingle(button);
    else if (button?.matches('.open-multi-payment')) void openMulti(button);
  }
  function updateSingle(name, value) {
    if (name === 'servidor') setSingleErrors({});
    setSingle((previous) => {
      const next = { ...previous, [name]: value };
      if (name === 'valor')
        next.basePrice =
          Number(value) / Math.max(1, Number(previous.creditos_gastos) || 1);
      return ['plano', 'servidor', 'creditos_gastos'].includes(name)
        ? calculateRenewal(next, planos, servidores)
        : next;
    });
  }
  function updateMulti(name, value) {
    if (name === 'selecao') setMultiErrors({});
    setMulti((previous) => {
      const next = { ...previous, [name]: value };
      if (name === 'selecao')
        next.periodos = String(
          previous.escolhas.find((group) => group.selecao === value)?.opcoes[0]
            .periodos || '',
        );
      if (name === 'selecao' || name === 'periodos')
        Object.assign(
          next,
          multiRenewalDates(
            next.escolhas.find((group) => group.selecao === next.selecao),
            next.periodos,
          ),
        );
      return next;
    });
  }
  function validate(event, kind) {
    if (submittingRef.current[kind]) {
      event.preventDefault();
      return;
    }
    const errors: Record<string, any> = {};
    const form = event.currentTarget;
    for (const field of form.querySelectorAll(
      '[name]',
    ) as NodeListOf<HTMLInputElement>) {
      if (field.matches(':disabled')) continue;
      const value = String(field.value).trim();
      if (field.hasAttribute('data-date-mask'))
        field.setCustomValidity(
          value && !normalizeDateInput(value) ? 'Informe uma data válida.' : '',
        );
      if (!value && field.dataset.required === '1')
        errors[field.name] = 'Campo obrigatório.';
      else if (value && !field.checkValidity())
        errors[field.name] = 'Informe um valor válido.';
    }
    for (const name of ['vencimento', 'pago_em']) {
      const field = form.elements.namedItem(name);
      if (
        field?.value &&
        !field.matches(':disabled') &&
        !normalizeDateInput(field.value)
      )
        errors[name] = 'Informe uma data válida.';
    }
    const message = ensurePreference().getState();
    if (message.pending || !message.ready)
      errors.mensagem_pagamento_id =
        message.error || 'Aguarde a sincronização da mensagem.';
    if (kind === 'multi' && (multi.loading || multi.error || !multi.chave))
      errors.selecao = multi.error || 'Aguarde o carregamento dos planos.';
    (kind === 'single' ? setSingleErrors : setMultiErrors)(errors);
    if (Object.keys(errors).length) {
      event.preventDefault();
      requestAnimationFrame(() =>
        form.elements.namedItem(Object.keys(errors)[0])?.focus(),
      );
    } else {
      submittingRef.current = { ...submittingRef.current, [kind]: true };
      setSubmitting(submittingRef.current);
    }
  }
  return {
    single,
    multi,
    singleRef,
    multiRef,
    singleErrors,
    multiErrors,
    preference,
    submitting,
    onPageClick,
    updateSingle,
    updateMulti,
    validate,
    saveMessage: (value) => void ensurePreference().save(value),
    reloadMessage: () => void ensurePreference().load(),
  };
}
