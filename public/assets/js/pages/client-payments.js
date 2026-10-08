window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initClientPayments = function ({
  on,
  setModalState,
  showNoticeModal,
  showToast,
  setDateInputValue,
  syncClienteUsageFields,
  somarPeriodo,
}) {
  const multiModal = document.getElementById('modal-renovar-planos');
  const multiForm = document.getElementById('renovar-planos-form');
  let multiEscolhas = [];
  let multiRequest = 0;
  function atualizarResumoPlanos(rebuild) {
    const grupo = multiEscolhas.find(
      (g) => g.selecao === multiForm.elements.selecao.value,
    );
    if (!grupo) return;
    const periodos = multiForm.elements.periodos;
    if (rebuild) {
      periodos.replaceChildren(
        ...grupo.opcoes.map((o) => new Option(o.label, o.periodos)),
      );
    }
    const opcao = grupo.opcoes.find(
      (o) => o.periodos === Number(periodos.value),
    );
    multiForm.querySelector('[data-multi-total]').textContent = Number(
      opcao.valor,
    ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const resumo = multiForm.querySelector('[data-multi-resumo]');
    resumo.replaceChildren(
      ...grupo.dados.itens.map((item) => {
        const linha = document.createElement('p');
        const [ano, mes, dia] = item.vencimento.split('-').map(Number);
        const atual = new Date(ano, mes - 1, dia);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const novo = somarPeriodo(
          atual > hoje ? atual : hoje,
          item.periodo,
          item.tipo,
          opcao.periodos,
        );
        linha.textContent =
          item.plano +
          ' — ' +
          item.servidor +
          ' — ' +
          (item.valor * opcao.periodos).toLocaleString('pt-BR', {
            style: 'currency',
            currency: 'BRL',
          }) +
          ' — novo vencimento: ' +
          novo.toLocaleDateString('pt-BR');
        return linha;
      }),
    );
  }
  multiForm?.elements.selecao.addEventListener('change', () =>
    atualizarResumoPlanos(true),
  );
  multiForm?.elements.periodos.addEventListener('change', () =>
    atualizarResumoPlanos(false),
  );
  document.querySelectorAll('.open-multi-payment').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const request = ++multiRequest;
      multiForm.reset();
      multiForm.elements.id.value = btn.dataset.id;
      multiForm.elements.selecao.replaceChildren();
      multiForm.elements.periodos.replaceChildren();
      multiForm.querySelector('[data-multi-resumo]').replaceChildren();
      multiForm.querySelector('[data-multi-total]').textContent = '—';
      multiForm.querySelector('[data-multi-nome]').textContent =
        btn.dataset.nome;
      const erro = multiForm.querySelector('[data-multi-erro]');
      const submit = multiModal.querySelector('[type="submit"]');
      submit.disabled = true;
      erro.textContent = 'Carregando planos…';
      setModalState(multiModal, true);
      try {
        const response = await fetch(
          '/clientes/' +
            encodeURIComponent(btn.dataset.id) +
            '/planos-renovacao',
          { headers: { Accept: 'application/json' } },
        );
        if (!response.ok)
          throw Error(
            'Não foi possível carregar os planos. Reabra a renovação.',
          );
        const data = await response.json();
        if (request !== multiRequest) return;
        multiEscolhas = data.escolhas;
        multiForm.elements.chave.value = data.chave;
        multiForm.elements.selecao.replaceChildren(
          ...multiEscolhas.map((g) => new Option(g.label, g.selecao)),
        );
        atualizarResumoPlanos(true);
        await syncPaymentMessagePreference(
          'GET',
          multiForm.elements.mensagem_pagamento_id,
        );
        if (request !== multiRequest) return;
        erro.textContent = '';
        submit.disabled = false;
      } catch (error) {
        if (request === multiRequest) erro.textContent = error.message;
      }
    }),
  );

  const paymentMessageStates = new WeakMap();
  function paymentMessageState(select) {
    if (!paymentMessageStates.has(select))
      paymentMessageStates.set(select, { pending: false, ready: false });
    return paymentMessageStates.get(select);
  }
  async function syncPaymentMessagePreference(
    method = 'GET',
    select = document.querySelector(
      '#modal-add-pagamento-form [name="mensagem_pagamento_id"]',
    ),
  ) {
    if (!select) return;
    const state = paymentMessageState(select);
    if (state.pending) return;
    state.pending = true;
    state.ready = false;
    select.disabled = true;
    try {
      const options = {
        method,
        cache: 'no-store',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      };
      if (method === 'POST') {
        options.headers['Content-Type'] = 'application/json';
        options.headers['x-csrf-token'] = window.getCsrfToken
          ? window.getCsrfToken()
          : '';
        options.body = JSON.stringify({ mensagemId: select.value });
      }
      const response = await fetch(
        '/clientes/preferencias/mensagem-pagamento',
        options,
      );
      if (!response.ok) throw new Error('Falha ao sincronizar preferência');
      const data = await response.json();
      if (!Object.prototype.hasOwnProperty.call(data, 'mensagemId'))
        throw new Error('Resposta inválida');
      const value = data.mensagemId == null ? '' : String(data.mensagemId);
      select.value = value;
      if (select.value !== value) {
        throw new Error('A lista de mensagens mudou. Recarregue a página.');
      }
      state.ready = true;
    } catch (error) {
      showToast(
        'Não foi possível sincronizar a mensagem após salvar. Reabra a renovação ou recarregue a página para tentar novamente.',
        'error',
      );
    } finally {
      select.disabled = false;
      state.pending = false;
    }
  }

  on(window, 'focus', () => {
    const modal = document.getElementById('modal-add-pagamento');
    if (modal && modal.getAttribute('aria-hidden') === 'false')
      syncPaymentMessagePreference();
    if (multiModal && multiModal.getAttribute('aria-hidden') === 'false')
      syncPaymentMessagePreference(
        'GET',
        multiForm.elements.mensagem_pagamento_id,
      );
  });

  if (multiForm) {
    const select = multiForm.elements.mensagem_pagamento_id;
    select.addEventListener('change', () =>
      syncPaymentMessagePreference('POST', select),
    );
    multiForm.addEventListener('submit', (event) => {
      const state = paymentMessageState(select);
      if (state.pending || !state.ready) {
        event.preventDefault();
        showToast(
          'Aguarde a sincronização da mensagem. Se houve uma falha, reabra a renovação para tentar novamente.',
          'error',
        );
      }
    });
  }

  document.querySelectorAll('.open-payment').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-pagamento');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-pagamento-form');
      if (!form) return;
      // Reseta para não vazar dados entre clientes.
      form.reset();
      form
        .querySelectorAll('.input-error')
        .forEach((el) => el.classList.remove('input-error'));
      form.querySelectorAll('[data-error-for]').forEach((el) => {
        el.textContent = '';
      });
      const modalErr = document.getElementById('modal-add-pagamento-error');
      if (modalErr) modalErr.textContent = '';

      const nome = btn.getAttribute('data-nome') || '';
      const venc = btn.getAttribute('data-vencimento') || '';
      const plano = btn.getAttribute('data-plano') || '';
      const servidor = btn.getAttribute('data-servidor') || '';
      const valor = btn.getAttribute('data-valor') || '0';
      const telas = btn.getAttribute('data-telas') || '1';
      const valorCred = btn.getAttribute('data-valor-cred') || '0';
      const horaVenc = btn.getAttribute('data-hora') || '23:59';

      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      // Novo vencimento = base + creditos × periodo. Base = max(hoje, venc antigo)
      // — cliente vencido há 90 dias renova pra data >= hoje, não pro passado.
      // Salva base+periodo+tipo no dataset pra o syncClienteUsageFields recalcular
      // sempre que o user mudar o numero de creditos.
      const periodoQtd = Math.max(
        1,
        Number(btn.getAttribute('data-periodo') || 30),
      );
      const periodoTipo = btn.getAttribute('data-tipo-periodo') || 'Dias';
      let baseDate = new Date();
      if (venc && /^\d{2}\/\d{2}\/\d{4}$/.test(venc)) {
        const parts = venc.split('/');
        const oldVenc = new Date(
          parseInt(parts[2], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[0], 10),
        );
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        baseDate = oldVenc > today ? oldVenc : today;
      }
      form.dataset.baseVencIso =
        baseDate.getFullYear() +
        '-' +
        String(baseDate.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(baseDate.getDate()).padStart(2, '0');
      form.dataset.periodoQtd = String(periodoQtd);
      form.dataset.periodoTipo = periodoTipo;
      form.dataset.creditosPlano =
        btn.getAttribute('data-creditos-plano') || '1';

      const horaInput = form.querySelector('[name="hora_vencimento"]');
      if (horaInput) horaInput.value = String(horaVenc).slice(0, 5) || '23:59';

      // Plano e servidor podem ser alterados na renovação.
      const planoInput = form.querySelector('[name="plano"]');
      if (planoInput) {
        planoInput
          .querySelectorAll('[data-plano-legado]')
          .forEach((option) => option.remove());
        if (
          plano &&
          !Array.from(planoInput.options).some(
            (option) => option.value === plano,
          )
        ) {
          const option = new Option(plano, plano);
          option.dataset.planoLegado = '1';
          option.dataset.periodo = String(periodoQtd);
          option.dataset.tipoPeriodo = periodoTipo;
          option.dataset.creditosPlano = form.dataset.creditosPlano;
          planoInput.add(option);
        }
      }
      if (planoInput) planoInput.value = plano;
      const planoDisplay = form.querySelector('[data-plano-display]');
      if (planoDisplay) planoDisplay.value = plano;
      const servidorInput = form.querySelector('[name="servidor"]');
      if (servidorInput) {
        servidorInput
          .querySelectorAll('[data-servidor-legado]')
          .forEach((option) => option.remove());
        if (
          servidor &&
          !Array.from(servidorInput.options).some(
            (option) => option.value === servidor,
          )
        ) {
          const option = new Option(servidor, servidor);
          option.dataset.servidorLegado = '1';
          option.dataset.valorCred = valorCred;
          servidorInput.add(option);
        }
      }
      if (servidorInput) servidorInput.value = servidor;
      const servidorDisplay = form.querySelector('[data-servidor-display]');
      if (servidorDisplay) servidorDisplay.value = servidor;
      // Cliente legado sem plano/servidor: avisa no topo do modal — não dá pra editar
      // esses campos aqui, o usuário precisa abrir a edição do cliente primeiro.
      const modalErrorTop = document.getElementById(
        'modal-add-pagamento-error',
      );
      if (modalErrorTop && (!plano || !servidor)) {
        modalErrorTop.textContent =
          'Este cliente está sem plano e/ou servidor. Edite o cliente para preencher esses campos antes de renovar.';
      }

      // valorBase = preco de 1 periodo do plano. O campo "valor" em si e recalculado
      // por syncClienteUsageFields (valorBase × creditos) — aqui so guardamos a base,
      // senao mudar os creditos nao teria de onde remultiplicar.
      form.dataset.valorBase = String(Number(valor) || 0);
      form.querySelector('[name="forma_pagamento"]').value = 'PIX';
      // Credits = 1 default. Telas (hidden) tambem vai 1 — backend usa o maior dos
      // dois pro custo. Se o cliente real tinha 2 telas, isso nao se perde porque
      // o telas no banco continua intacto ate o backend escrever de novo.
      const creditosInput = form.querySelector('[name="creditos_gastos"]');
      if (creditosInput) creditosInput.value = '1';
      // Telas (hidden) = telas do cliente, FIXAS na renovacao. Entram no custo e no
      // consumo do servidor (telas × creditos) — nao mais espelham os creditos.
      const telasInput = form.querySelector('[name="telas"]');
      if (telasInput) telasInput.value = telas;
      form.dataset.valorCred = valorCred;
      // Calcula data + custo automaticamente (e reage quando user muda creditos).
      syncClienteUsageFields(form);

      // Pago em = hoje.
      const today = new Date();
      const dd = String(today.getDate()).padStart(2, '0');
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      setDateInputValue(
        form.querySelector('[name="pago_em"]'),
        today.getFullYear() + '-' + mm + '-' + dd,
      );

      syncPaymentMessagePreference();
      const title = modal.querySelector('#pagamento-title');
      if (title) title.textContent = '↻ Renovar - ' + nome;
      setModalState(modal, true);
    });
  });

  // Valida campos obrigatórios do modal de renovação (mesmo padrão do cadastro).
  const pagamentoFormEl = document.getElementById('modal-add-pagamento-form');
  if (pagamentoFormEl) {
    pagamentoFormEl.addEventListener('submit', (e) => {
      const modalError = document.getElementById('modal-add-pagamento-error');
      pagamentoFormEl
        .querySelectorAll('.input-error')
        .forEach((el) => el.classList.remove('input-error'));
      pagamentoFormEl.querySelectorAll('[data-error-for]').forEach((el) => {
        el.textContent = '';
      });
      if (modalError) modalError.textContent = '';
      let missing = false;
      pagamentoFormEl
        .querySelectorAll('[data-required="1"]')
        .forEach((field) => {
          if (!String(field.value || '').trim()) {
            field.classList.add('input-error');
            const msg = pagamentoFormEl.querySelector(
              '[data-error-for="' + field.getAttribute('name') + '"]',
            );
            if (msg) msg.textContent = 'Campo obrigatório.';
            missing = true;
          }
        });
      if (missing) {
        if (modalError)
          modalError.textContent = 'Revise os campos obrigatórios destacados.';
        e.preventDefault();
      }
      // Backend usa "valor" como valor_pago quando esse campo não vem no body.
    });
  }

  const pagamentoForm = document.getElementById('modal-add-pagamento-form');
  if (pagamentoForm) {
    const mensagemPagamento = pagamentoForm.querySelector(
      '[name="mensagem_pagamento_id"]',
    );
    if (mensagemPagamento) {
      mensagemPagamento.addEventListener('change', () => {
        syncPaymentMessagePreference('POST');
      });
    }
    pagamentoForm.addEventListener('submit', async (e) => {
      if (e.defaultPrevented) return;
      const state = paymentMessageState(mensagemPagamento);
      if (state.pending || !state.ready) {
        e.preventDefault();
        showToast(
          'Aguarde a sincronização da mensagem. Se houve uma falha, reabra a renovação para tentar novamente.',
          'error',
        );
        return;
      }
      if (pagamentoForm.dataset.nativeSubmit === '1') return;
      e.preventDefault();
      pagamentoForm
        .querySelectorAll('.input-error')
        .forEach((el) => el.classList.remove('input-error'));
      pagamentoForm.querySelectorAll('[data-error-for]').forEach((el) => {
        el.textContent = '';
      });
      const formData = new FormData(pagamentoForm);
      formData.set('action', 'add_pagamento');
      try {
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'x-csrf-token': window.getCsrfToken ? window.getCsrfToken() : '',
          },
          body: formData,
        });
        const data = await res.json();
        if (data.ok && data.rowHtml) {
          const id = pagamentoForm.querySelector('[name="id"]').value;
          const row = document.querySelector('tr[data-id="' + id + '"]');
          if (row) {
            row.insertAdjacentHTML('beforebegin', data.rowHtml);
            row.remove();
          }
          setModalState(pagamentoForm.closest('.modal-overlay'), false);
          if (!showNoticeModal('Pagamento salvo.', 'success')) {
            showToast('Pagamento salvo.', 'success');
          }
        } else {
          if (data.errors) {
            Object.keys(data.errors).forEach((key) => {
              const field = pagamentoForm.querySelector('[name="' + key + '"]');
              if (field) field.classList.add('input-error');
              const msg = pagamentoForm.querySelector(
                '[data-error-for="' + key + '"]',
              );
              if (msg) msg.textContent = data.errors[key];
            });
          } else if (
            !showNoticeModal(
              data.message || 'Erro ao salvar pagamento.',
              'error',
            )
          ) {
            showToast(data.message || 'Erro ao salvar pagamento.', 'error');
          }
        }
      } catch (err) {
        if (!showNoticeModal('Erro ao salvar pagamento.', 'error')) {
          showToast('Erro ao salvar pagamento.', 'error');
        }
      }
    });
  }
};
