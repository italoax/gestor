import { useRef, useState } from 'react';

const preferenceKeys = {
  message: 'pref-enviar-msg',
  template: 'pref-msg-template-id',
};
function readPreference(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// Os campos nativos são não controlados; React controla a seleção, as abas,
// preferências, visibilidade e erros. As máscaras compartilhadas usam o mesmo ref.
export function useClientForm() {
  const ref = useRef(null);
  const [servers, setServers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState('');
  const [status, setStatus] = useState('Ativo');
  const [tab, setTab] = useState('dados');
  const [total, setTotal] = useState(0);
  const [errors, setErrors] = useState({});
  const [sendMessage, setSendMessage] = useState(false);
  const [template, setTemplate] = useState('');
  const additional = servers.length === 2;
  const tools = () => window.gestorClientFieldTools;

  function setField(name, value = '') {
    const input = ref.current?.elements.namedItem(name);
    if (!input) return;
    const text = String(value ?? '');
    if (
      input.tagName === 'SELECT' &&
      text &&
      !Array.from(input.options).some((o) => o.value === text)
    ) {
      const option = new Option(text + ' (atual)', text);
      option.dataset.fallback = '1';
      input.add(option);
    }
    if (input.hasAttribute('data-date-mask'))
      tools()?.setDateInputValue(input, text);
    else input.value = text;
  }
  function updateTotal(active = additional) {
    const form = ref.current;
    if (!form) return;
    setTotal(
      Number(form.elements.valor.value || 0) +
        (active ? Number(form.elements.adicional_valor.value || 0) : 0),
    );
  }
  function syncScreenPrice() {
    const form = ref.current;
    const base = Number(form?.dataset.valorPorTela);
    const screens = Number(form?.elements.telas.value);
    if (
      base > 0 &&
      Number.isFinite(base) &&
      screens >= 1 &&
      Number.isFinite(screens)
    )
      form.elements.valor.value = (base * screens).toFixed(2);
  }
  function onInput(event) {
    const form = ref.current;
    if (event.target.name === 'valor') {
      const value = Number(event.target.value);
      if (value > 0 && Number.isFinite(value))
        form.dataset.valorPorTela = String(
          value / Math.max(1, Number(form.elements.telas.value) || 1),
        );
    } else if (event.target.name === 'telas') syncScreenPrice();
    updateTotal();
  }
  function clearAdditional() {
    for (const name of [
      'plano',
      'valor',
      'telas',
      'vencimento',
      'user',
      'id_painel',
      'aplicativo',
      'dispositivo',
    ])
      setField('adicional_' + name, name === 'telas' ? 1 : '');
  }
  function restorePreferences() {
    setSendMessage(readPreference(preferenceKeys.message, '0') === '1');
    const saved = readPreference(preferenceKeys.template);
    const select = ref.current?.elements.template_boas_vindas;
    setTemplate(
      select && Array.from(select.options).some((o) => o.value === saved)
        ? saved
        : '',
    );
  }
  function reset() {
    setServers([]);
    setEditing(false);
    setClientId('');
    setStatus('Ativo');
    setTab('dados');
    setTotal(0);
    setErrors({});
    restorePreferences();
    if (ref.current) delete ref.current.dataset.valorPorTela;
  }
  function newClient() {
    const form = ref.current;
    if (!form) return;
    form.reset();
    form
      .querySelectorAll('option[data-fallback="1"]')
      .forEach((option) => option.remove());
    tools()?.setPhonePrefix(form.querySelector('[data-phone-prefix]'), '+55');
    setField('action', 'create_cliente');
    setField('id', '');
    setField('status', 'Ativo');
  }
  function editClient(button) {
    const form = ref.current;
    if (!form) return;
    form.reset();
    form
      .querySelectorAll('option[data-fallback="1"]')
      .forEach((option) => option.remove());
    const fields = {
      id: 'id',
      nome: 'nome',
      user: 'user',
      status: 'status',
      vencimento: 'vencimento',
      plano: 'plano',
      servidor: 'servidor',
      valor: 'valor',
      telas: 'telas',
      forma_pagamento: 'formaPagamento',
      senha: 'senha',
      id_painel: 'idPainel',
      email: 'email',
      captacao: 'captacao',
      aniversario: 'aniversario',
      link_m3u: 'linkM3u',
      time_cliente: 'timeCliente',
      telefone_secundario: 'telefoneSecundario',
      observacoes: 'observacoes',
      data_inicio: 'dataInicio',
      hora_vencimento: 'horaVencimento',
      pontos_fidelidade: 'pontos',
      sigma_customer_id: 'sigmaCustomerId',
      dispositivo: 'dispositivo',
      aplicativo: 'aplicativo',
    };
    for (const [name, attribute] of Object.entries(fields))
      setField(name, button.dataset[attribute] || '');
    setField('action', 'update_cliente');
    const phone = tools();
    const telephone = button.dataset.telefone || '';
    if (phone) {
      const prefix = phone.findPrefixFromPhone(telephone);
      phone.setPhonePrefix(form.querySelector('[data-phone-prefix]'), prefix);
      form.elements.telefone.value = phone.stripPhonePrefix(telephone, prefix);
      phone.formatPhoneInput(form.elements.telefone);
    } else setField('telefone', telephone);
    let extra = null;
    try {
      extra = JSON.parse(button.dataset.adicional || 'null');
    } catch {}
    const selected = [button.dataset.servidor || ''];
    if (extra?.servidor && extra.servidor !== selected[0]) {
      selected.push(extra.servidor);
      for (const name of [
        'plano',
        'valor',
        'telas',
        'vencimento',
        'user',
        'id_painel',
        'aplicativo',
        'dispositivo',
      ])
        setField(
          'adicional_' + name,
          extra[name === 'id_painel' ? 'idPainel' : name] ??
            (name === 'telas' ? 1 : ''),
        );
    } else clearAdditional();
    setServers(selected.filter(Boolean));
    const value = Number(button.dataset.valor) || 0;
    if (value > 0)
      form.dataset.valorPorTela = String(
        value / Math.max(1, Number(button.dataset.telas) || 1),
      );
    const fallback = form.elements.plano.selectedOptions[0];
    if (fallback?.dataset.fallback)
      fallback.dataset.creditos = button.dataset.creditos || '0';
    setEditing(true);
    setClientId(button.dataset.id || '');
    setStatus(button.dataset.status || 'Ativo');
    restorePreferences();
    updateTotal(selected.length === 2);
    form.querySelector('[data-servidores-multiselect]').open = true;
    window.gestorSetModalState?.(form.closest('.modal-overlay'), true);
  }
  function toggleServer(name, checked) {
    const form = ref.current;
    let next = [...servers];
    if (checked) {
      if (next.includes(name) || next.length >= 2) return;
      next.push(name);
      if (next.length === 2 && !form.elements.adicional_plano.value)
        setField('adicional_plano', form.elements.plano.value);
    } else {
      if (next[0] === name && next.length === 2) {
        for (const field of [
          'plano',
          'valor',
          'telas',
          'user',
          'id_painel',
          'aplicativo',
          'dispositivo',
          'vencimento',
        ])
          setField(field, form.elements['adicional_' + field].value);
        const value = Number(form.elements.valor.value);
        form.dataset.valorPorTela = String(
          value / Math.max(1, Number(form.elements.telas.value) || 1),
        );
      }
      next = next.filter((server) => server !== name);
      clearAdditional();
    }
    setServers(next);
    setField('servidor', next[0] || '');
    setField('adicional_servidor', next[1] || '');
    syncScreenPrice();
    updateTotal(next.length === 2);
  }
  function onChange(event) {
    const input = event.target;
    if (input.name === 'telas') syncScreenPrice();
    if (input.name === 'enviar_boas_vindas') {
      setSendMessage(input.checked);
      savePreference(preferenceKeys.message, input.checked ? '1' : '0');
    }
    if (input.name === 'template_boas_vindas') {
      setTemplate(input.value);
      savePreference(preferenceKeys.template, input.value);
    }
    if (
      input.name === 'plano' &&
      additional &&
      !ref.current.elements.adicional_plano.value
    )
      setField('adicional_plano', input.value);
    updateTotal();
  }
  function onSubmit(event) {
    const form = ref.current;
    const invalid = Array.from(
      form.querySelectorAll('[data-required="1"]'),
    ).filter(
      (field) =>
        !field.disabled && (!field.value.trim() || !field.checkValidity()),
    );
    const nextErrors = {};
    for (const field of invalid)
      nextErrors[field.name] = !field.value.trim()
        ? 'Campo obrigatório.'
        : field.type === 'number'
          ? 'Informe um valor válido, maior ou igual a ' +
            (field.min || '0') +
            '.'
          : 'Informe um valor válido.';
    setErrors(nextErrors);
    if (!invalid.length) return;
    event.preventDefault();
    setTab(invalid[0].dataset.tab || 'dados');
    requestAnimationFrame(() => {
      const visible = invalid.find((field) => !field.hidden);
      (
        visible || form.querySelector('[data-servidores-opcoes] input')
      )?.focus();
    });
  }
  function onPageClick(event) {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.matches('.edit-cliente')) editClient(button);
    else if (button.matches('[data-open-modal="modal-add-cliente"]'))
      newClient();
  }
  function onPageSubmit(event) {
    if (
      event.target.matches('form.delete-cliente') &&
      !window.confirm('Deseja apagar este cliente?')
    )
      event.preventDefault();
  }
  return {
    ignoreChange: () => {},
    ref,
    servers,
    additional,
    editing,
    clientId,
    status,
    tab,
    setTab,
    total,
    errors,
    sendMessage,
    template,
    reset,
    toggleServer,
    onChange,
    onInput,
    onSubmit,
    onPageClick,
    onPageSubmit,
    updateTotal,
  };
}
