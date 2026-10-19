window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initTransactions = function ({
  setIconLabel,
  setModalState,
}) {
  if (document.querySelector('[data-react-page="transacoes"]') as HTMLElement)
    return;
  const search = document.querySelector<HTMLInputElement>('#tx-search');
  const payment = document.querySelector<HTMLSelectElement>(
    '[data-tx-payment-filter]',
  );
  const size = document.querySelector<HTMLSelectElement>('[data-tx-page-size]');
  const filterForm =
    document.querySelector<HTMLFormElement>('[data-tx-filters]');
  let filterTimer: ReturnType<typeof setTimeout>;
  const submitFilters = () => {
    clearTimeout(filterTimer);
    if (filterForm?.isConnected) filterForm.requestSubmit();
  };
  search?.addEventListener('input', () => {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(submitFilters, 300);
  });
  payment?.addEventListener('change', submitFilters);
  size?.addEventListener('change', submitFilters);
  document
    .querySelector('[data-tx-clear-filters]')
    ?.addEventListener('click', () => {
      if (search) search.value = '';
      if (payment) payment.value = '';
      submitFilters();
    });
  // ----- Transações -----
  (
    document.querySelectorAll(
      '[data-open-modal="modal-nova-transacao"]',
    ) as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(
        'modal-nova-transacao-form',
      ) as HTMLFormElement;
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]') as HTMLInputElement;
        if (a) a.value = 'create_transacao';
        const i = form.querySelector('[name="id"]') as HTMLInputElement;
        if (i) i.value = '';
      }
      const titulo = document.querySelector(
        '#modal-nova-transacao .modal-header h3',
      ) as HTMLElement;
      if (titulo) titulo.textContent = '+ Nova Transação';
    });
  });

  (
    document.querySelectorAll('.edit-transacao') as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-nova-transacao',
      ) as HTMLElement;
      const form =
        modal &&
        (modal.querySelector('#modal-nova-transacao-form') as HTMLFormElement);
      if (!form) return;
      const set = (name, val) => {
        const el = form.querySelector(
          '[name="' + name + '"]',
        ) as HTMLInputElement;
        if (el) el.value = val;
      };
      set('action', 'update_transacao');
      set('id', btn.getAttribute('data-id') || '');
      set('data', btn.getAttribute('data-data') || '');
      set('forma_pagamento', btn.getAttribute('data-forma') || '');
      set('cliente_id', btn.getAttribute('data-cliente-id') || '');
      set('descricao', btn.getAttribute('data-descricao') || '');
      set('plano', btn.getAttribute('data-plano') || '');
      set('servidor', btn.getAttribute('data-servidor') || '');
      set('telas', btn.getAttribute('data-telas') || '1');
      set('creditos', btn.getAttribute('data-creditos') || '0');
      set('custo', btn.getAttribute('data-custo') || '0');
      set('valor_venda', btn.getAttribute('data-valor-venda') || '');
      const titulo = modal.querySelector('.modal-header h3') as HTMLElement;
      if (titulo) setIconLabel(titulo, 'edit', 'Editar Transação');
      setModalState(modal, true);
    });
  });

  (
    document.querySelectorAll('.view-transacao') as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-transacao-info',
      ) as HTMLElement;
      if (!modal) return;
      const put = (id, attr) => {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) el.textContent = btn.getAttribute(attr) || '—';
      };
      put('tx-info-data', 'data-data');
      put('tx-info-cliente', 'data-cliente');
      put('tx-info-pagamento', 'data-pagamento');
      put('tx-info-descricao', 'data-descricao');
      put('tx-info-servidor', 'data-servidor');
      put('tx-info-plano', 'data-plano');
      put('tx-info-telas', 'data-telas');
      const codes = Number(btn.getAttribute('data-codigos')) || 0;
      const duration = btn.getAttribute('data-duracao') || '';
      const quantityLabel = document.getElementById('tx-info-quantidade-label');
      if (quantityLabel)
        quantityLabel.textContent = codes ? 'Códigos' : 'Telas';
      if (codes) put('tx-info-telas', 'data-codigos');
      put('tx-info-duracao', 'data-duracao');
      const durationGroup = document.getElementById('tx-info-duracao-group');
      if (durationGroup) durationGroup.hidden = !duration;
      const creditsGroup = document.getElementById('tx-info-creditos-group');
      if (creditsGroup)
        creditsGroup.hidden =
          codes > 0 && codes === Number(btn.getAttribute('data-creditos-num'));
      put('tx-info-creditos', 'data-creditos');
      put('tx-info-custo', 'data-custo');
      put('tx-info-total', 'data-total');
      put('tx-info-lucro', 'data-lucro');
      // Aplica cor + sinal correto no Lucro (inline style — independente de CSS file)
      const lucroEl = document.getElementById('tx-info-lucro') as HTMLElement;
      if (lucroEl) {
        const neg = btn.getAttribute('data-lucro-neg') === '1';
        const raw = btn.getAttribute('data-lucro') || '—';
        lucroEl.textContent = neg || raw.startsWith('-') ? raw : '+' + raw;
        lucroEl.style.color = neg ? '#ef4444' : '#22c55e';
      }
      const totalEl = document.getElementById('tx-info-total') as HTMLElement;
      if (totalEl) {
        const raw = btn.getAttribute('data-total') || '—';
        totalEl.textContent =
          raw.startsWith('+') || raw.startsWith('-') ? raw : '+' + raw;
      }
      setModalState(modal, true);
    });
  });

  // Linha inteira de transacao vira tappable — delega para o botao 👁 (view-transacao)
  // que ja tem todos os data-* atributos. Ignora cliques em form/botoes p/ nao
  // colidir com o trash.
  (document.querySelectorAll('tr.tx-row') as NodeListOf<HTMLElement>).forEach(
    (row) => {
      const open = () => {
        const btn = row.querySelector('.view-transacao') as HTMLElement;
        if (btn) btn.click();
      };
      row.addEventListener('click', (e) => {
        if (
          (e.target as HTMLElement).closest(
            'button, a, input, form, select, label',
          ) as HTMLElement
        )
          return;
        if (window.getSelection && window.getSelection().toString().length > 0)
          return;
        open();
      });
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    },
  );

  const txClienteSelect = document.querySelector(
    '[data-tx-cliente]',
  ) as HTMLSelectElement;
  if (txClienteSelect) {
    txClienteSelect.addEventListener('change', () => {
      const opt = txClienteSelect.selectedOptions[0];
      if (!opt || !opt.value) return;
      const form = txClienteSelect.closest('form') as HTMLFormElement;
      if (!form) return;
      const fill = (name, val) => {
        const el = form.querySelector(
          '[name="' + name + '"]',
        ) as HTMLInputElement;
        if (el && !el.value) el.value = val;
      };
      fill('plano', opt.getAttribute('data-plano') || '');
      fill('servidor', opt.getAttribute('data-servidor') || '');
      const telas = form.querySelector('[name="telas"]') as HTMLInputElement;
      if (telas) telas.value = opt.getAttribute('data-telas') || '1';
      fill('valor_venda', opt.getAttribute('data-valor') || '');
    });
  }
};
