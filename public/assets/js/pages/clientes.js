window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initClients = function ({
  on,
  setIconLabel,
  setModalState,
  showNoticeModal,
  showToast,
  setDateInputValue,
  findPrefixFromPhone,
  setPhonePrefix,
  stripPhonePrefix,
  formatPhoneInput,
  syncClienteUsageFields,
}) {
  // Memoriza a preferência do usuário para o switch "Enviar mensagem" e qual
  // template foi escolhido por último — assim, da próxima vez que abrir o modal
  // o estado já vem como o usuário deixou.
  const PREF_KEYS = { enviar_boas_vindas: 'pref-enviar-msg' };
  const PREF_DEFAULTS = { enviar_boas_vindas: false };
  const PREF_TEMPLATE_KEY = 'pref-msg-template-id';
  function lerPref(name) {
    try {
      const raw = localStorage.getItem(PREF_KEYS[name]);
      if (raw === null) return PREF_DEFAULTS[name];
      return raw === '1';
    } catch {
      return PREF_DEFAULTS[name];
    }
  }
  function gravarPref(name, value) {
    try {
      localStorage.setItem(PREF_KEYS[name], value ? '1' : '0');
    } catch {
      /* ignora */
    }
  }
  // Mostra/oculta o select de template conforme o switch.
  function aplicarToggleTemplate(form) {
    if (!form) return;
    const toggle = form.querySelector('[data-toggle-template]');
    const wrapper = form.querySelector('[data-template-wrapper]');
    if (!toggle || !wrapper) return;
    wrapper.hidden = !toggle.checked;
  }
  function aplicarPrefs(form) {
    if (!form) return;
    Object.keys(PREF_KEYS).forEach((name) => {
      const el = form.querySelector('[name="' + name + '"]');
      if (el) el.checked = lerPref(name);
    });
    // Reaplica o último template escolhido (se ainda existir no select).
    const tplSelect = form.querySelector('[name="template_boas_vindas"]');
    if (tplSelect) {
      const savedId = localStorage.getItem(PREF_TEMPLATE_KEY) || '';
      if (
        savedId &&
        tplSelect.querySelector('option[value="' + savedId + '"]')
      ) {
        tplSelect.value = savedId;
      }
    }
    aplicarToggleTemplate(form);
  }
  // Salva quando o usuário muda o switch — uma única vez basta para virar default.
  on(document, 'change', (e) => {
    const target = e.target;
    if (!target || target.tagName !== 'INPUT' || target.type !== 'checkbox')
      return;
    const name = target.getAttribute('name');
    if (PREF_KEYS[name]) gravarPref(name, target.checked);
    if (target.hasAttribute('data-toggle-template')) {
      const form = target.closest('form');
      if (form) aplicarToggleTemplate(form);
    }
  });
  // Memoriza o último template escolhido.
  on(document, 'change', (e) => {
    const target = e.target;
    if (
      target &&
      target.tagName === 'SELECT' &&
      target.getAttribute('name') === 'template_boas_vindas'
    ) {
      try {
        localStorage.setItem(PREF_TEMPLATE_KEY, target.value || '');
      } catch {
        /* ignora */
      }
    }
  });

  const cadastroPlanos = document.getElementById('modal-add-cliente-form');
  function prepararErrosCadastro() {
    if (!cadastroPlanos) return;
    cadastroPlanos.querySelectorAll('[data-required="1"]').forEach((field) => {
      if (field.disabled) return;
      const container = field.closest('label, .field');
      if (!container) return;
      let error = cadastroPlanos.querySelector(
        '[data-error-for="' + field.name + '"]',
      );
      if (!error) {
        error = document.createElement('small');
        error.className = 'field-error';
        error.dataset.errorFor = field.name;
        error.id = 'cliente-error-' + field.name;
        error.setAttribute('aria-live', 'polite');
        container.append(error);
      }
      if (!error.id) error.id = 'cliente-error-' + field.name;
      field.setAttribute('aria-describedby', error.id);
    });
  }
  function atualizarTotalCadastro() {
    if (!cadastroPlanos) return;
    const total =
      Number(cadastroPlanos.elements.valor.value || 0) +
      (cadastroPlanos.elements.tem_plano_adicional.checked
        ? Number(cadastroPlanos.elements.adicional_valor.value || 0)
        : 0);
    cadastroPlanos.querySelector('[data-cadastro-total]').textContent =
      total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  cadastroPlanos?.addEventListener('input', atualizarTotalCadastro);
  cadastroPlanos?.addEventListener('change', atualizarTotalCadastro);
  function renderSelecaoServidores() {
    if (!cadastroPlanos) return;
    const principal = cadastroPlanos.elements.servidor;
    const adicional = cadastroPlanos.elements.adicional_servidor;
    const ativo = cadastroPlanos.elements.tem_plano_adicional.checked;
    const selecionados = [principal.value, ativo ? adicional.value : ''].filter(
      Boolean,
    );
    const lista = cadastroPlanos.querySelector('[data-servidores-opcoes]');
    if (!lista) return;
    cadastroPlanos.querySelector('[data-servidores-resumo]').textContent =
      selecionados.join(' + ') || 'Selecione os servidores';
    cadastroPlanos.querySelector('[data-adicional-titulo]').textContent =
      adicional.value || 'Segundo servidor';
    cadastroPlanos.querySelector('[data-principal-titulo]').textContent =
      principal.value || 'Primeiro servidor';
    cadastroPlanos.querySelector('[data-app-principal]').textContent =
      principal.value || 'Primeiro servidor';
    cadastroPlanos.querySelector('[data-app-segundo]').textContent =
      adicional.value || 'Segundo servidor';
    atualizarTotalCadastro();
    const nomes = [
      ...new Set(
        [...principal.options, ...adicional.options]
          .map((o) => o.value)
          .filter(Boolean),
      ),
    ];
    lista.replaceChildren(
      ...nomes.map((nome) => {
        const label = document.createElement('label');
        label.className = 'server-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = nome;
        checkbox.checked = selecionados.includes(nome);
        checkbox.disabled = selecionados.length >= 2 && !checkbox.checked;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            if (!principal.value) principal.value = nome;
            else {
              adicional.value = nome;
              cadastroPlanos.elements.tem_plano_adicional.checked = true;
              if (!cadastroPlanos.elements.adicional_plano.value)
                cadastroPlanos.elements.adicional_plano.value =
                  cadastroPlanos.elements.plano.value;
            }
          } else if (principal.value === nome) {
            if (ativo && adicional.value) {
              principal.value = adicional.value;
              for (const campo of [
                'plano',
                'valor',
                'telas',
                'user',
                'id_painel',
                'aplicativo',
                'dispositivo',
              ]) {
                cadastroPlanos.elements[campo].value =
                  cadastroPlanos.elements['adicional_' + campo].value;
              }
              setDateInputValue(
                cadastroPlanos.elements.vencimento,
                cadastroPlanos.elements.adicional_vencimento.value,
              );
            } else principal.value = '';
            syncPlanoAdicional(null);
          } else syncPlanoAdicional(null);
          principal.dispatchEvent(new Event('change', { bubbles: true }));
          syncPlanoAdicional();
          renderSelecaoServidores();
          Array.from(lista.querySelectorAll('input'))
            .find((input) => input.value === nome)
            ?.focus();
        });
        label.append(checkbox, document.createTextNode(nome));
        return label;
      }),
    );
  }
  function syncPlanoAdicional(adicional) {
    if (!cadastroPlanos) return;
    const toggle = cadastroPlanos.querySelector('[data-toggle-adicional]');
    const fields = cadastroPlanos.querySelector('[data-plano-adicional]');
    if (!toggle || !fields) return;
    if (adicional !== undefined) {
      toggle.checked = Boolean(adicional);
      [
        'plano',
        'servidor',
        'valor',
        'telas',
        'vencimento',
        'user',
        'id_painel',
      ].forEach((key) => {
        const input = fields.querySelector('[name="adicional_' + key + '"]');
        const value =
          adicional?.[key === 'id_painel' ? 'idPainel' : key] ??
          (key === 'telas' ? 1 : '');
        if (
          input.tagName === 'SELECT' &&
          value &&
          !Array.from(input.options).some((o) => o.value === value)
        )
          input.add(new Option(value + ' (atual)', value));
        input.value = value;
      });
    }
    const apps = cadastroPlanos.querySelector('[data-app-adicional]');
    apps.hidden = !toggle.checked;
    apps.querySelectorAll('select').forEach((input) => {
      input.disabled = !toggle.checked;
      input.required = toggle.checked && input.name === 'adicional_aplicativo';
      if (input.required) input.dataset.required = '1';
      else delete input.dataset.required;
      if (adicional !== undefined) {
        const key = input.name.replace('adicional_', '');
        const value = adicional?.[key] || '';
        if (value && !Array.from(input.options).some((o) => o.value === value))
          input.add(new Option(value + ' (atual)', value));
        input.value = value;
      }
    });
    fields.hidden = !toggle.checked;
    fields.querySelectorAll('input, select').forEach((input) => {
      input.disabled = !toggle.checked;
      const obrigatorio = !['adicional_user', 'adicional_id_painel'].includes(
        input.name,
      );
      input.required = toggle.checked && obrigatorio;
      if (input.required) {
        input.dataset.required = '1';
        input.dataset.tab = 'plano';
        input.dataset.fieldLabel = input
          .closest('label')
          .querySelector('span').textContent;
      } else delete input.dataset.required;
    });
    prepararErrosCadastro();
  }
  cadastroPlanos
    ?.querySelector('[data-toggle-adicional]')
    ?.addEventListener('change', () => syncPlanoAdicional());
  cadastroPlanos?.elements.plano.addEventListener('change', () => {
    if (
      cadastroPlanos.elements.tem_plano_adicional.checked &&
      !cadastroPlanos.elements.adicional_plano.value
    ) {
      cadastroPlanos.elements.adicional_plano.value =
        cadastroPlanos.elements.plano.value;
    }
  });
  cadastroPlanos?.addEventListener('reset', () =>
    setTimeout(() => {
      syncPlanoAdicional(null);
      renderSelecaoServidores();
    }, 0),
  );
  syncPlanoAdicional();
  renderSelecaoServidores();
  document.querySelectorAll('.edit-cliente').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-cliente');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-cliente-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_cliente';

      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      syncPlanoAdicional(JSON.parse(btn.dataset.adicional || 'null'));
      form.querySelector('[name="status"]').value =
        btn.getAttribute('data-status') || 'Ativo';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="user"]').value =
        btn.getAttribute('data-user') || '';
      const telefoneInput = form.querySelector('[name="telefone"]');
      if (telefoneInput) {
        const telefoneCompleto = btn.getAttribute('data-telefone') || '';
        const prefix = findPrefixFromPhone(telefoneCompleto);
        setPhonePrefix(form.querySelector('[data-phone-prefix]'), prefix);
        telefoneInput.value = stripPhonePrefix(telefoneCompleto, prefix);
        formatPhoneInput(telefoneInput);
      }
      setDateInputValue(
        form.querySelector('[name="vencimento"]'),
        btn.getAttribute('data-vencimento') || '',
      );
      // Para selects: se o valor salvo no cliente não existir mais nas options
      // (catálogo renomeado/apagado), injeta opção temporária com o valor salvo
      // pra ele NÃO virar branco no Editar. Antes ficava em branco silenciosamente.
      const setSelectWithFallback = (name, value) => {
        const sel = form.querySelector('[name="' + name + '"]');
        if (!sel) return;
        // Limpa fallback de uma edição anterior pra não acumular ao trocar de cliente.
        sel
          .querySelectorAll('option[data-fallback="1"]')
          .forEach((o) => o.remove());
        const valor = String(value || '');
        if (!valor) {
          sel.value = '';
          return;
        }
        if (
          sel.tagName === 'SELECT' &&
          !sel.querySelector(
            'option[value="' + valor.replace(/"/g, '\\"') + '"]',
          )
        ) {
          const opt = document.createElement('option');
          opt.value = valor;
          opt.textContent = valor + ' (atual)';
          opt.dataset.fallback = '1';
          sel.appendChild(opt);
        }
        sel.value = valor;
      };
      setSelectWithFallback('plano', btn.getAttribute('data-plano') || '');
      const planoFallback = form.querySelector(
        '[name="plano"] option[data-fallback="1"]',
      );
      if (planoFallback)
        planoFallback.dataset.creditos =
          btn.getAttribute('data-creditos') || '0';
      form.querySelector('[name="valor"]').value =
        btn.getAttribute('data-valor') || '';
      setSelectWithFallback(
        'servidor',
        btn.getAttribute('data-servidor') || '',
      );
      renderSelecaoServidores();
      setSelectWithFallback(
        'forma_pagamento',
        btn.getAttribute('data-forma-pagamento') || '',
      );
      form.querySelector('[name="telas"]').value =
        btn.getAttribute('data-telas') || '1';
      // Semeia o "valor por tela" com o estado atual do cliente (valor / telas),
      // pra que aumentar/diminuir as telas escale o valor na mesma proporcao.
      // Ex.: R$ 25 com 1 tela -> R$ 25/tela; mudar pra 2 telas -> R$ 50.
      const valEdit = Number(btn.getAttribute('data-valor')) || 0;
      const telasEdit = Math.max(
        1,
        Number(btn.getAttribute('data-telas')) || 1,
      );
      if (valEdit > 0) form.dataset.valorPorTela = String(valEdit / telasEdit);
      else delete form.dataset.valorPorTela;
      // Pré-preenche os campos novos (guardado: ignora se o campo não existir no DOM)
      const extras = {
        senha: 'data-senha',
        id_painel: 'data-id-painel',
        email: 'data-email',
        captacao: 'data-captacao',
        aniversario: 'data-aniversario',
        link_m3u: 'data-link-m3u',
        time_cliente: 'data-time-cliente',
        telefone_secundario: 'data-telefone-secundario',
        observacoes: 'data-observacoes',
        data_inicio: 'data-data-inicio',
        hora_vencimento: 'data-hora-vencimento',
        pontos_fidelidade: 'data-pontos',
        sigma_customer_id: 'data-sigma-customer-id',
      };
      Object.keys(extras).forEach((name) => {
        const el = form.querySelector('[name="' + name + '"]');
        if (el) el.value = btn.getAttribute(extras[name]) || '';
      });
      // dispositivo e aplicativo também são selects — aplica o mesmo fallback.
      setSelectWithFallback(
        'dispositivo',
        btn.getAttribute('data-dispositivo') || '',
      );
      setSelectWithFallback(
        'aplicativo',
        btn.getAttribute('data-aplicativo') || '',
      );
      // Aplica a preferência salva (sobrepõe o valor do cliente — usuário pediu
      // explicitamente que, uma vez desmarcado, permaneça desmarcado).
      aplicarPrefs(form);
      // "Registrar pagamento" só vale para cliente novo: oculta na edição.
      // querySelectorAll (nao querySelector): sao varios blocos so-de-cadastro
      // (registrar pagamento, enviar mensagem e o select de template). Com o
      // singular, so o primeiro sumia na edicao.
      modal.querySelectorAll('[data-only-new]').forEach((el) => {
        el.style.display = 'none';
      });
      const tituloEd = modal.querySelector('.modal-header h3');
      if (tituloEd) setIconLabel(tituloEd, 'edit', 'Editar Cliente');
      const btnEd = document.querySelector(
        'button[type="submit"][form="modal-add-cliente-form"]',
      );
      if (btnEd) btnEd.textContent = 'Salvar Cliente';
      syncClienteUsageFields(form);
      atualizarTotalCadastro();
      cadastroPlanos.querySelector('[data-servidores-multiselect]').open = true;
      setModalState(modal, true);
    });
  });

  // Abrir "Novo Cliente": reexibe e marca a opção de registrar pagamento.
  document
    .querySelectorAll('[data-open-modal="modal-add-cliente"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('modal-add-cliente');
        if (!modal) return;
        const form = modal.querySelector('#modal-add-cliente-form');
        // Reseta o form antes — senão valores de uma edição anterior viajam pro novo cliente.

        if (form) {
          form.reset();
          form
            .querySelectorAll('option[data-fallback="1"]')
            .forEach((option) => option.remove());
          // form.reset() não limpa o prefixo de telefone (componente custom).
          const phonePrefix = form.querySelector('[data-phone-prefix]');
          if (phonePrefix) setPhonePrefix(phonePrefix, '+55');
          // Limpa qualquer destaque de erro deixado por uma validação anterior.
          form
            .querySelectorAll('.input-error')
            .forEach((el) => el.classList.remove('input-error'));
          form.querySelectorAll('[data-error-for]').forEach((el) => {
            el.textContent = '';
          });
          const modalErr = document.getElementById('modal-add-cliente-error');
          if (modalErr) modalErr.textContent = '';
        }
        // Remove qualquer display:none deixado por uma edição anterior — caso
        // contrário, o switch "Registrar pagamento" some no Novo Cliente.
        modal.querySelectorAll('[data-only-new]').forEach((el) => {
          el.style.removeProperty('display');
          // O select de template continua governado pelo switch "Enviar mensagem"
          // (aplicarPrefs, logo abaixo). Forcar hidden=false aqui faria ele
          // aparecer mesmo com o switch desligado.
          if (!el.hasAttribute('data-template-wrapper')) el.hidden = false;
        });
        const reg = modal.querySelector('[name="registrar_pagamento"]');
        if (reg) reg.checked = true;
        aplicarPrefs(form);
        const act = modal.querySelector(
          '#modal-add-cliente-form [name="action"]',
        );
        if (act) act.value = 'create_cliente';
        const idf = modal.querySelector('#modal-add-cliente-form [name="id"]');
        if (idf) idf.value = '';
        // Cliente novo nao herda o "valor por tela" da edicao anterior — a base so
        // passa a existir quando o usuario digitar o primeiro valor (listener acima).
        if (form) delete form.dataset.valorPorTela;
        const tituloNv = modal.querySelector('.modal-header h3');
        if (tituloNv) setIconLabel(tituloNv, 'plus', 'Novo Cliente');
        const btnNv = document.querySelector(
          'button[type="submit"][form="modal-add-cliente-form"]',
        );
        if (btnNv) btnNv.textContent = 'Cadastrar Cliente';
        // Volta para a primeira aba (Dados).
        const firstTab = modal.querySelector('.tab-btn[data-tab="dados"]');
        if (firstTab) firstTab.click();
        if (form) syncClienteUsageFields(form);
      });
    });

  document.querySelectorAll('form.delete-cliente').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      if (form.dataset.nativeSubmit === '1') {
        if (!confirm('Deseja apagar este cliente?')) e.preventDefault();
        return;
      }
      e.preventDefault();
      if (!confirm('Deseja apagar este cliente?')) return;
      const formData = new FormData(form);
      formData.set('action', 'delete_cliente');
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
        if (data.ok) {
          const row = form.closest('tr');
          if (row) row.remove();
          const badge = document.querySelector('.toolbar .badge');
          if (badge && typeof data.count !== 'undefined') {
            badge.textContent = data.count;
          }
          if (!showNoticeModal('Cliente apagado.', 'success')) {
            showToast('Cliente apagado.', 'success');
          }
        } else {
          if (!showNoticeModal(data.message || 'Erro ao apagar.', 'error')) {
            showToast(data.message || 'Erro ao apagar.', 'error');
          }
        }
      } catch (err) {
        if (!showNoticeModal('Erro ao apagar.', 'error')) {
          showToast('Erro ao apagar.', 'error');
        }
      }
    });
  });

  document.querySelectorAll('.info-cliente').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-cliente-info');
      if (!modal) return;
      const map = {
        'info-nome': 'data-nome',
        'info-user': 'data-user',
        'info-telefone': 'data-telefone',
        'info-vencimento': 'data-vencimento',
        'info-plano': 'data-plano',
        'info-valor': 'data-valor',
        'info-status': 'data-status',
        'info-servidor': 'data-servidor',
        'info-telas': 'data-telas',
      };
      Object.keys(map).forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = btn.getAttribute(map[id]) || '';
      });
      setModalState(modal, true);
    });
  });

  const clienteForm = document.getElementById('modal-add-cliente-form');
  if (clienteForm) {
    const requiredModal = document.getElementById('modal-required-fields');
    const requiredList = document.getElementById('modal-required-list');
    const requiredGo = document.getElementById('modal-required-go');
    const requiredMessage = document.getElementById('modal-required-message');

    const openRequiredModal = (items) => {
      if (!requiredModal || !requiredList || !requiredGo) return;
      requiredList.innerHTML = '';
      const first = items[0];
      items.forEach((it) => {
        const div = document.createElement('div');
        div.className = 'item';
        const tabLabel =
          {
            pagamento: 'Aba Pagamento',
            plano: 'Aba Plano',
            apps: 'Aba Apps',
            dados: 'Aba Dados',
          }[it.tab] || 'Aba Dados';
        div.innerHTML = '<span>' + it.label + ' — ' + tabLabel + '</span>';
        requiredList.appendChild(div);
      });
      requiredGo.onclick = () => {
        if (!first) return;
        const tabBtn = document.querySelector(
          '.tab-btn[data-tab="' + first.tab + '"]',
        );
        if (tabBtn) tabBtn.click();
        setModalState(requiredModal, false);
      };
      requiredMessage.textContent =
        'Existem campos obrigatórios em outra aba. Veja abaixo:';
      setModalState(requiredModal, true);
    };

    // Valida campos obrigatórios SEMPRE — inclusive quando o envio é nativo (data-native-submit="1").
    // Se faltar algo, bloqueia o submit, destaca os campos e exibe a mensagem embaixo.
    const validarObrigatorios = (form) => {
      const modalError = document.getElementById('modal-add-cliente-error');
      form
        .querySelectorAll('.input-error')
        .forEach((el) => el.classList.remove('input-error'));
      form.querySelectorAll('[data-error-for]').forEach((el) => {
        el.textContent = '';
      });
      if (modalError) modalError.textContent = '';
      const missing = [];
      form.querySelectorAll('[data-required="1"]').forEach((field) => {
        if (field.disabled) return;
        const name = field.getAttribute('name');
        const value = (field.value || '').trim();
        if (!value || !field.checkValidity()) {
          field.classList.add('input-error');
          const msg = form.querySelector('[data-error-for="' + name + '"]');
          if (msg && !msg.textContent)
            msg.textContent = !value
              ? 'Campo obrigatório.'
              : field.type === 'number'
                ? 'Informe um valor válido, maior ou igual a ' +
                  (field.min || '0') +
                  '.'
                : 'Informe um valor válido.';
          missing.push({
            label: field.getAttribute('data-field-label') || name,
            tab: field.getAttribute('data-tab') || 'dados',
          });
        }
      });
      if (missing.length) {
        const first = missing[0];
        document
          .querySelector('.tab-btn[data-tab="' + first.tab + '"]')
          ?.click();
        if (modalError)
          modalError.textContent = 'Revise os campos obrigatórios destacados.';
        const invalid = form.querySelector('.input-error:not([hidden])');
        invalid?.focus();
        return false;
      }
      return true;
    };

    clienteForm.addEventListener('submit', async (e) => {
      if (clienteForm.dataset.nativeSubmit === '1') {
        if (!validarObrigatorios(clienteForm)) {
          e.preventDefault();
        }
        return;
      }
      e.preventDefault();
      const form = e.currentTarget;
      const modalError = document.getElementById('modal-add-cliente-error');
      const formData = new FormData(form);
      const actionInput = form.querySelector('[name="action"]');
      if (actionInput) {
        formData.set('action', actionInput.value);
      }

      // Clear previous field errors
      form
        .querySelectorAll('.input-error')
        .forEach((el) => el.classList.remove('input-error'));
      form.querySelectorAll('[data-error-for]').forEach((el) => {
        el.textContent = '';
      });
      if (modalError) modalError.textContent = '';

      const missing = [];
      form.querySelectorAll('[data-required="1"]').forEach((field) => {
        if (field.disabled) return;
        const name = field.getAttribute('name');
        const value = (field.value || '').trim();
        if (!value || !field.checkValidity()) {
          field.classList.add('input-error');
          const msg = form.querySelector('[data-error-for="' + name + '"]');
          if (msg && !msg.textContent)
            msg.textContent = !value
              ? 'Campo obrigatório.'
              : field.type === 'number'
                ? 'Informe um valor válido, maior ou igual a ' +
                  (field.min || '0') +
                  '.'
                : 'Informe um valor válido.';
          missing.push({
            label: field.getAttribute('data-field-label') || name,
            tab: field.getAttribute('data-tab') || 'dados',
          });
        }
      });
      if (missing.length) {
        const otherTab = missing.find((m) => m.tab === 'pagamento');
        if (otherTab) {
          openRequiredModal(missing);
        } else if (modalError) {
          modalError.textContent = 'Revise os campos obrigatórios destacados.';
        }
        return;
      }

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
        if (data.ok) {
          const tbody = document.querySelector('.table tbody');
          if (tbody && data.rowHtml) {
            if (actionInput && actionInput.value === 'update_cliente') {
              const id = form.querySelector('[name="id"]').value;
              const oldRow = document.querySelector('tr[data-id="' + id + '"]');
              if (oldRow) {
                oldRow.insertAdjacentHTML('beforebegin', data.rowHtml);
                oldRow.remove();
              }
            } else {
              tbody.insertAdjacentHTML('afterbegin', data.rowHtml);
            }
          }
          const badge = document.querySelector('.toolbar .badge');
          if (badge && typeof data.count !== 'undefined') {
            badge.textContent = data.count;
          }
          form.reset();
          const overlay = form.closest('.modal-overlay');
          if (overlay) setModalState(overlay, false);
          if (
            !showNoticeModal(
              data.message || 'Cliente salvo com sucesso.',
              'success',
            )
          ) {
            showToast(data.message || 'Cliente salvo com sucesso.', 'success');
          }
        } else {
          if (data.errors) {
            const missingServer = [];
            Object.keys(data.errors).forEach((key) => {
              const field = form.querySelector('[name="' + key + '"]');
              if (field) field.classList.add('input-error');
              const msg = form.querySelector('[data-error-for="' + key + '"]');
              if (msg) msg.textContent = data.errors[key];
              if (field) {
                missingServer.push({
                  label: field.getAttribute('data-field-label') || key,
                  tab: field.getAttribute('data-tab') || 'dados',
                });
              }
            });
            const otherTab = missingServer.find((m) => m.tab === 'pagamento');
            if (otherTab) {
              openRequiredModal(missingServer);
            } else if (modalError) {
              modalError.textContent =
                'Revise os campos obrigatórios destacados.';
            }
          } else if (data.message) {
            if (modalError) {
              modalError.textContent = data.message;
            } else {
              if (!showNoticeModal(data.message, 'error')) {
                showToast(data.message, 'error');
              }
            }
          }
        }
      } catch (err) {
        if (modalError) {
          modalError.textContent = 'Erro ao salvar. Tente novamente.';
        } else {
          if (!showNoticeModal('Erro ao salvar. Tente novamente.', 'error')) {
            showToast('Erro ao salvar. Tente novamente.', 'error');
          }
        }
      }
    });
  }
};
