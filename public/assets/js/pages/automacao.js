window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initBillingRules = function ({ setModalState }) {
  document.querySelectorAll('.edit-cobranca').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-cobranca');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-cobranca-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_cobranca';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="titulo"]').value =
        btn.getAttribute('data-titulo') || '';
      form.querySelector('[name="tipo"]').value =
        btn.getAttribute('data-tipo') || 'Vencimento';
      form.querySelector('[name="tipo_periodo"]').value =
        btn.getAttribute('data-tipo-periodo') || 'Dias';
      form.querySelector('[name="periodo"]').value =
        btn.getAttribute('data-periodo') || '0';
      form.querySelector('[name="status"]').value =
        btn.getAttribute('data-status') || 'Ativo';
      form.querySelector('[name="mensagem_id"]').value =
        btn.getAttribute('data-mensagem-id') || '';
      const auto = form.querySelector('[name="automatica"]');
      if (auto)
        auto.checked = (btn.getAttribute('data-automatica') || '0') === '1';
      form.querySelector('[name="hora_envio"]').value =
        btn.getAttribute('data-hora-envio') || '09:00';
      const diasRaw = (btn.getAttribute('data-dias-semana') || '')
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
      const diasNumericos = diasRaw.map(Number);
      const diasOneBase =
        diasNumericos.length > 0 &&
        diasNumericos.every((n) => Number.isInteger(n) && n >= 1 && n <= 7);
      const dias = diasOneBase
        ? diasNumericos.map((n) => String(n === 7 ? 0 : n))
        : diasRaw;
      form.querySelectorAll('input[name="dias_semana[]"]').forEach((chk) => {
        chk.checked = dias.includes(chk.value);
      });
      const title = modal.querySelector('#cobranca-title');
      if (title) title.textContent = 'Editar Cobrança';
      setModalState(modal, true);
    });
  });

  const cobrancaForm = document.getElementById('modal-add-cobranca-form');
  if (cobrancaForm) {
    const clienteStatusSelect = cobrancaForm.querySelector(
      '[data-cliente-status]',
    );
    const periodoInput = cobrancaForm.querySelector('[data-periodo-input]');
    const syncPeriodoByClienteStatus = () => {
      if (!clienteStatusSelect || !periodoInput) return;
      const disablePeriodo = clienteStatusSelect.value === 'Vence Hoje';
      periodoInput.disabled = disablePeriodo;
      if (disablePeriodo) {
        periodoInput.dataset.previousValue = periodoInput.value;
        periodoInput.value = '0';
      } else if (
        periodoInput.value === '0' &&
        periodoInput.dataset.previousValue
      ) {
        periodoInput.value = periodoInput.dataset.previousValue;
      }
    };
    if (clienteStatusSelect && periodoInput) {
      clienteStatusSelect.addEventListener(
        'change',
        syncPeriodoByClienteStatus,
      );
      syncPeriodoByClienteStatus();
    }
  }

  document.querySelectorAll('.open-cobranca-recipients').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-cobranca-recipients');
      if (!modal) return;
      const title = modal.querySelector('#cobranca-recipients-title');
      const summary = modal.querySelector('#cobranca-recipients-summary');
      const list = modal.querySelector('#cobranca-recipients-list');
      let nomes = [];
      try {
        nomes = JSON.parse(btn.getAttribute('data-recebedores') || '[]');
      } catch (e) {
        nomes = [];
      }
      const cobrancaTitulo = btn.getAttribute('data-title') || 'Cobrança';
      if (title) title.textContent = 'Recebem - ' + cobrancaTitulo;
      if (summary)
        summary.textContent =
          nomes.length === 1
            ? '1 cliente vai receber esta mensagem.'
            : nomes.length + ' clientes vão receber esta mensagem.';
      if (list) {
        list.innerHTML = '';
        if (!nomes.length) {
          const item = document.createElement('li');
          item.className = 'recipient-empty';
          item.textContent = 'Nenhum cliente encontrado para esta regra.';
          list.appendChild(item);
        } else {
          nomes.forEach((nome, index) => {
            const item = document.createElement('li');
            const number = document.createElement('span');
            number.textContent = String(index + 1).padStart(2, '0');
            const label = document.createElement('strong');
            label.textContent = nome;
            item.appendChild(number);
            item.appendChild(label);
            list.appendChild(item);
          });
        }
      }
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('form.delete-cobranca').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar esta cobrança?')) {
        e.preventDefault();
      }
    });
  });

  document.querySelectorAll('[data-toggle-cobranca]').forEach((input) => {
    input.addEventListener('change', async () => {
      const formData = new FormData();
      formData.set('action', 'toggle_cobranca');
      formData.set('id', input.getAttribute('data-id') || '');
      formData.set('automatica', input.checked ? '1' : '0');
      try {
        await fetch(window.location.href, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'x-csrf-token': window.getCsrfToken ? window.getCsrfToken() : '',
          },
          body: formData,
        });
      } catch (e) {
        input.checked = !input.checked;
        const status = input
          .closest('[data-switch]')
          ?.querySelector('.switch-status');
        if (status) status.textContent = input.checked ? 'Ativa' : 'Inativa';
      }
    });
  });
};
