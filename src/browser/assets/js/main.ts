import { confirmFormSubmission, showPanelNotice } from './ui/panel-feedback.js';
let gestorInitialization = 0;
document.addEventListener('gestor:before-swap', () => gestorInitialization++);
async function initGestor() {
  const initialization = ++gestorInitialization;
  await window.gestorMountReactPage?.();
  if (initialization !== gestorInitialization) return;
  const modules = window.gestorPageModules;
  // Texto dinâmico do modal de plano
  var planoInfo = document.querySelector('[data-plano-info]') as HTMLElement;
  if (planoInfo) {
    var pPer = document.querySelector(
      '#modal-add-plano-form [name="periodo"]',
    ) as HTMLInputElement;
    var pCred = document.querySelector(
      '#modal-add-plano-form [name="creditos"]',
    ) as HTMLInputElement;
    var pTipo = document.querySelector(
      '#modal-add-plano-form [name="tipo"]',
    ) as HTMLInputElement;
    var pLabel = document.querySelector(
      '[data-plano-periodo-label]',
    ) as HTMLElement;
    var updPlano = function () {
      var per = Number(pPer && pPer.value) || 0;
      var cred = Number(pCred && pCred.value) || 0;
      var meses = pTipo && pTipo.value === 'Meses';
      var unidade = meses
        ? per === 1
          ? 'mês'
          : 'meses'
        : per === 1
          ? 'dia'
          : 'dias';
      if (pLabel)
        pLabel.textContent = 'Período (' + (meses ? 'meses' : 'dias') + ') *';
      planoInfo.innerHTML =
        'Este plano terá duração de <strong>' +
        per +
        ' ' +
        unidade +
        '</strong> e consumirá <strong>' +
        cred.toLocaleString('pt-BR') +
        ' crédito(s)</strong> do servidor ao renovar.';
    };
    if (pPer) pPer.addEventListener('input', updPlano);
    if (pCred) pCred.addEventListener('input', updPlano);
    if (pTipo) pTipo.addEventListener('change', updPlano);
    updPlano();
  }

  const setIconLabel = (element, name, label = '') => {
    const template = document.querySelector(
      'template[data-ui-icon="' + name + '"]',
    ) as HTMLTemplateElement;
    element.replaceChildren();
    if (template) element.append(template.content.cloneNode(true));
    else {
      const source = document.querySelector(
        '[data-ui-icon-source="' + name + '"] svg',
      ) as HTMLElement;
      if (source) element.append(source.cloneNode(true));
    }
    if (label) element.append(document.createTextNode(' ' + label));
  };
  (
    document.querySelectorAll(
      '[data-password-field]',
    ) as NodeListOf<HTMLElement>
  ).forEach((field) => {
    const input = field.querySelector('input') as HTMLInputElement;
    const toggle = field.querySelector('[data-password-toggle]') as HTMLElement;
    const feedback = field.querySelector(
      '[data-password-feedback]',
    ) as HTMLElement;
    const reset = () => {
      input.type = 'password';
      toggle.setAttribute('aria-label', 'Mostrar senha');
      toggle.title = 'Mostrar senha';
      toggle.setAttribute('aria-pressed', 'false');
      const label = toggle.querySelector(
        '[data-password-toggle-label]',
      ) as HTMLElement;
      if (label) label.textContent = 'Mostrar';
      feedback.textContent = '';
    };
    toggle.onclick = () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute(
        'aria-label',
        show ? 'Ocultar senha' : 'Mostrar senha',
      );
      toggle.title = toggle.getAttribute('aria-label');
      toggle.setAttribute('aria-pressed', String(show));
      const label = toggle.querySelector(
        '[data-password-toggle-label]',
      ) as HTMLElement;
      if (label) label.textContent = show ? 'Ocultar' : 'Mostrar';
    };
    if (input.form) input.form.addEventListener('reset', reset);
    reset();
  });
  // Re-executavel (pjax): a cada init abortamos os listeners globais do init
  // anterior pra nao acumular. Listeners de document/window/topbar (casca
  // persistente) sao registrados via on(...) que injeta o { signal }; os de
  // conteudo (dentro de .app-content) nao precisam — o innerHTML e trocado no
  // swap, entao os nós antigos (com seus listeners) somem junto.
  if (window.__gestorAbort) {
    try {
      window.__gestorAbort.abort();
    } catch (e) {}
  }
  const __ac = 'AbortController' in window ? new AbortController() : null;
  window.__gestorAbort = __ac;
  const __sig = __ac ? __ac.signal : undefined;
  const on = (
    target: EventTarget,
    type: string,
    handler: (event: any) => void,
    opts?: AddEventListenerOptions | boolean,
  ) => {
    let o = opts;
    if (o === true) o = { capture: true };
    else if (o === false || o == null) o = {};
    if (__sig) o = Object.assign({}, o, { signal: __sig });
    target.addEventListener(type, handler, o);
  };

  const accountForm = document.querySelector<HTMLFormElement>(
    '[data-account-profile-form]',
  );
  if (accountForm) {
    // Enter nos dados do perfil deve salvar, sem acionar as ações de segurança.
    on(accountForm, 'keydown', (event: KeyboardEvent) => {
      if (
        event.key !== 'Enter' ||
        event.isComposing ||
        !(event.target instanceof HTMLInputElement)
      )
        return;
      const save = accountForm.querySelector<HTMLButtonElement>(
        '[data-account-save]',
      );
      if (save) {
        event.preventDefault();
        accountForm.requestSubmit(save);
      }
    });
    on(accountForm, 'submit', (event: SubmitEvent) => {
      if (
        !(event.submitter instanceof HTMLButtonElement) ||
        !event.submitter.hasAttribute('data-account-security-action')
      )
        return;
      const password = accountForm.elements.namedItem(
        'current_password',
      ) as HTMLInputElement;
      if (!password?.value) {
        event.preventDefault();
        password?.focus();
        showPanelNotice(
          'Informe sua senha atual no campo acima para continuar.',
          true,
        );
      }
    });
  }

  // Preserva a posicao de rolagem ao salvar um formulario. Formularios que
  // navegam (submit nativo -> POST -> redirect -> reload) faziam a pagina voltar
  // pro topo, perdendo o lugar onde o usuario estava na lista. Guardamos o
  // scrollY no submit e restauramos no carregamento seguinte da MESMA pagina.
  // Vale pra TODAS as telas (clientes, planos, servidores...) sem alteracao por tela.
  const SCROLL_KEY = 'gestor:scroll:' + location.pathname;
  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch (e) {}
  (function restoreScrollAfterSave() {
    let saved = null;
    try {
      saved = JSON.parse(sessionStorage.getItem(SCROLL_KEY) || 'null');
    } catch (e) {}
    try {
      sessionStorage.removeItem(SCROLL_KEY);
    } catch (e) {}
    // TTL curto (15s): so restaura logo apos um salvamento, nunca num F5 avulso muito depois.
    if (
      !saved ||
      typeof saved.y !== 'number' ||
      Date.now() - (saved.t || 0) >= 15000
    )
      return;
    const y = saved.y;
    const jump = () => window.scrollTo(0, y);
    jump();
    requestAnimationFrame(jump);
    // Reaplica apos o load (fontes/imagens assentarem a altura) pra nao parar no lugar errado.
    on(window, 'load', () => {
      jump();
      setTimeout(jump, 0);
    });
  })();

  // Camada 1 — CLICK IMEDIATO em botoes com data-loading-text.
  // Sem isso, botoes cujo form redirecionava em <300ms nunca mostravam o
  // spinner visualmente — a impressao era que o bloqueio nao funcionava.
  // So opt-in via atributo data-loading-text (evita quebrar botoes de
  // form-AJAX que dependem de checkValidity/preventDefault posterior).
  on(
    document,
    'click',
    function (e) {
      const btn = (e.target as HTMLElement).closest(
        'button[data-loading-text], input[data-loading-text]',
      ) as HTMLInputElement;
      if (!btn) return;
      // Ja em submit em andamento? bloqueia click extra sem mexer no default.
      if (btn.dataset.submitting === '1') {
        e.preventDefault();
        return;
      }
      if (btn.disabled) {
        e.preventDefault();
        return;
      }
      const formId = btn.getAttribute('form');
      const form = formId
        ? (document.getElementById(formId) as HTMLFormElement)
        : (btn.closest('form') as HTMLFormElement);
      if (!form) return;
      if (form.closest('[data-ajax-panel]')) return;
      if (!form.hasAttribute('novalidate') && !form.checkValidity()) return;
      // CRITICO: NAO usar btn.disabled = true aqui. Se marcar disabled na fase
      // capture, o browser cancela a acao default (submit do form) porque ve o
      // botao "desabilitado" ao dispatchar. Usa data-submitting + classe visual
      // + pointer-events pra bloquear cliques repetidos sem quebrar o submit.
      btn.dataset.submitting = '1';
      btn.dataset.prevText = btn.innerHTML;
      btn.classList.add('is-submitting');
      btn.style.pointerEvents = 'none';
      const loadingText = btn.getAttribute('data-loading-text') || 'Salvando';
      btn.innerHTML =
        '<span class="btn-spinner" aria-hidden="true"></span> ' + loadingText;
      setTimeout(function () {
        if (btn.dataset.prevText === undefined) return; // ja resetado
        if (form.dataset.submitting === '1') return; // camada 2 assumiu
        btn.dataset.submitting = '';
        btn.classList.remove('is-submitting');
        btn.style.pointerEvents = '';
        btn.innerHTML = btn.dataset.prevText;
        delete btn.dataset.prevText;
      }, 4000);
    },
    true,
  );

  // Camada 2 — SUBMIT no form: cobre botoes SEM data-loading-text (comportamento
  // legacy — bloqueia com texto padrao "Salvando..."). Tambem cuida do caso
  // do submit ter vindo via Enter no campo, nao via click.
  on(document, 'submit', function (e) {
    const form = e.target as HTMLElement;
    if (!form || form.tagName !== 'FORM') return;
    if (
      window.gestorNavigate &&
      (form.closest('main.app-content') as HTMLElement)
    )
      return;
    if (e.defaultPrevented) return; // formularios AJAX ja chamaram preventDefault: nao navegam, nao salvam scroll
    // Guarda a rolagem atual pra restaurar apos o reload (restoreScrollAfterSave, no topo).
    try {
      sessionStorage.setItem(
        SCROLL_KEY,
        JSON.stringify({ y: window.scrollY, t: Date.now() }),
      );
    } catch (e2) {}
    if (form.dataset.submitting === '1') {
      e.preventDefault();
      return;
    }
    form.dataset.submitting = '1';
    const botoes = new Set<HTMLButtonElement | HTMLInputElement>();
    (
      form.querySelectorAll(
        'button[type="submit"], input[type="submit"], button:not([type])',
      ) as NodeListOf<HTMLButtonElement>
    ).forEach((b) => botoes.add(b));
    if (form.id) {
      (
        document.querySelectorAll(
          'button[type="submit"][form="' +
            form.id +
            '"], input[type="submit"][form="' +
            form.id +
            '"]',
        ) as NodeListOf<HTMLButtonElement>
      ).forEach((b) => botoes.add(b));
    }
    botoes.forEach((btn) => {
      if (btn.disabled) return;
      if (btn.dataset.submitting === '1') return; // camada 1 (click) ja tratou
      btn.disabled = true;
      btn.dataset.prevText = btn.innerHTML;
      btn.classList.add('is-submitting');
      const loadingText = btn.getAttribute('data-loading-text') || 'Salvando';
      btn.innerHTML =
        '<span class="btn-spinner" aria-hidden="true"></span> ' + loadingText;
    });
    // Failsafe reduzido pra 4s — formularios AJAX que nao redirecionam (ex.:
    // editar servidor) ficariam travados no antigo 10s. 4s cobre a maioria
    // dos POSTs; se o server for mais lento, o browser ja vai ter navegado
    // antes ou vai continuar bloqueado ate o fetch resolver.
    setTimeout(function () {
      if (form.dataset.submitting !== '1') return;
      form.dataset.submitting = '';
      botoes.forEach((btn) => {
        btn.disabled = false;
        btn.classList.remove('is-submitting');
        if (btn.dataset.prevText) {
          btn.innerHTML = btn.dataset.prevText;
          delete btn.dataset.prevText;
        }
      });
    }, 4000);
  });

  const {
    setModalState,
    getTopOpenModal,
    focusableSelector,
    syncModalUiState,
  } = modules.initModals({ on });

  modules.initClientAccess({ on, setModalState });
  const dropdowns = document.querySelectorAll(
    '[data-dropdown]',
  ) as NodeListOf<HTMLElement>;
  dropdowns.forEach((d) => {
    const trigger = d.querySelector('.nav-trigger') as HTMLElement;
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdowns.forEach((other) => {
        if (other !== d) other.classList.remove('open');
      });
      d.classList.toggle('open');
    });
  });

  on(document, 'click', () => {
    dropdowns.forEach((d) => d.classList.remove('open'));
  });

  const hamburger = document.querySelector('[data-hamburger]') as HTMLElement;
  const nav = document.querySelector('[data-nav]') as HTMLElement;
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  // Alternância de tema claro/escuro (persistido em localStorage).
  (
    document.querySelectorAll(
      '[data-theme-toggle]',
    ) as NodeListOf<HTMLInputElement>
  ).forEach((btn) => {
    on(btn, 'click', () => {
      const isLight =
        document.documentElement.getAttribute('data-theme') === 'light';
      const next = isLight ? 'dark' : 'light';
      if (next === 'light')
        document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      try {
        localStorage.setItem('gestor-theme', next);
      } catch (e) {}
    });
  });

  (
    document.querySelectorAll(
      '[data-switch] input',
    ) as NodeListOf<HTMLInputElement>
  ).forEach((input) => {
    input.addEventListener('change', () => {
      const status = (
        input.closest('[data-switch]') as HTMLElement
      ).querySelector('.switch-status') as HTMLElement;
      status.textContent = input.checked ? 'Ativa' : 'Inativa';
    });
  });

  const phone = modules.initPhoneFields({ on });

  const { setDateInputValue } = modules.initDateFields({ setIconLabel });

  modules.initTables({ on });

  on(document, 'click', (event) => {
    const btn = (event.target as HTMLElement).closest(
      '[data-open-modal]',
    ) as HTMLInputElement;
    if (!btn) return;
    event.preventDefault();
    const id = btn.getAttribute('data-open-modal');
    const modal = document.getElementById(id) as HTMLElement;
    if (modal) {
      if (id === 'modal-add-plano') {
        const form = modal.querySelector(
          '#modal-add-plano-form',
        ) as HTMLFormElement;
        if (form) {
          form.reset();
          (form.querySelector('[name="action"]') as HTMLInputElement).value =
            'create_plano';
          (form.querySelector('[name="id"]') as HTMLInputElement).value = '';
        }
      }
      if (id === 'modal-add-servidor') {
        const form = modal.querySelector(
          '#modal-add-servidor-form',
        ) as HTMLFormElement;
        if (form) {
          form.reset();
          (form.querySelector('[name="action"]') as HTMLInputElement).value =
            'create_servidor';
          (form.querySelector('[name="id"]') as HTMLInputElement).value = '';
        }
      }
      if (id === 'modal-add-cobranca') {
        const form = modal.querySelector(
          '#modal-add-cobranca-form',
        ) as HTMLFormElement;
        if (form) {
          form.reset();
          (form.querySelector('[name="action"]') as HTMLInputElement).value =
            'create_cobranca';
          (form.querySelector('[name="id"]') as HTMLInputElement).value = '';
          const title = modal.querySelector('#cobranca-title') as HTMLElement;
          if (title) title.textContent = 'Adicionar Cobrança';
        }
      }
      if (id === 'modal-add-mensagem') {
        const form = modal.querySelector(
          '#modal-add-mensagem-form',
        ) as HTMLFormElement;
        if (form) {
          form.reset();
          (form.querySelector('[name="action"]') as HTMLInputElement).value =
            'create_mensagem';
          (form.querySelector('[name="id"]') as HTMLInputElement).value = '';
          const title = modal.querySelector('.modal-header h3') as HTMLElement;
          if (title) setIconLabel(title, 'plus', 'Novo Template');
        }
      }
      const triggerSelector = '[data-open-modal="' + id + '"]';
      setModalState(modal, true, triggerSelector);
    }
  });

  (
    document.querySelectorAll(
      '[data-close-modal]',
    ) as NodeListOf<HTMLInputElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay') as HTMLElement;
      if (overlay) setModalState(overlay, false);
    });
  });

  (
    document.querySelectorAll('.modal-overlay') as NodeListOf<HTMLElement>
  ).forEach((overlay) => {
    let pointerStartedOnBackdrop = false;
    overlay.addEventListener('pointerdown', (e) => {
      pointerStartedOnBackdrop = (e.target as HTMLElement) === overlay;
    });
    overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement) === overlay && pointerStartedOnBackdrop) {
        setModalState(overlay, false);
      }
      pointerStartedOnBackdrop = false;
    });
  });

  on(document, 'keydown', (e) => {
    const topModal = getTopOpenModal();
    if (!topModal) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      setModalState(topModal, false);
      return;
    }

    if (e.key !== 'Tab') return;
    const focusableEls = Array.from(
      topModal.querySelectorAll(focusableSelector) as NodeListOf<HTMLElement>,
    ).filter((el) => el.offsetParent !== null && !el.hasAttribute('disabled'));
    if (!focusableEls.length) {
      e.preventDefault();
      return;
    }

    const first = focusableEls[0];
    const last = focusableEls[focusableEls.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !topModal.contains(active)) {
        e.preventDefault();
        last.focus();
      }
      return;
    }

    if (active === last || !topModal.contains(active)) {
      e.preventDefault();
      first.focus();
    }
  });

  syncModalUiState();

  (document.querySelectorAll('.modal') as NodeListOf<HTMLElement>).forEach(
    (modal) => {
      if (modal.querySelector('[data-react-client-form]') as HTMLElement)
        return;
      const tabs = modal.querySelectorAll(
        '.tab-btn',
      ) as NodeListOf<HTMLElement>;
      const panels = modal.querySelectorAll(
        '.tab-panel',
      ) as NodeListOf<HTMLElement>;
      tabs.forEach((tab) => {
        tab.addEventListener('click', () => {
          const key = tab.getAttribute('data-tab');
          tabs.forEach((t) => t.classList.remove('active'));
          panels.forEach((p) => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = modal.querySelector(
            '[data-tab-panel=\"' + key + '\"]',
          ) as HTMLElement;
          if (panel) panel.classList.add('active');
        });
      });
    },
  );

  modules.initCatalogs({ setIconLabel, setModalState });

  window.gestorClientFieldTools = { ...phone, setDateInputValue };

  modules.initTransactions({ setIconLabel, setModalState });

  modules.initWhatsappMessages({ setModalState });

  (
    document.querySelectorAll(
      'form.delete-plano',
    ) as NodeListOf<HTMLFormElement>
  ).forEach((form) => {
    form.addEventListener('submit', (e) => {
      confirmFormSubmission(e, 'Deseja apagar este plano?');
    });
  });

  modules.initMessageTemplates({ setIconLabel, setModalState });

  modules.initBillingRules({ setModalState });

  modules.initMessageTags({ setModalState });

  // Input masks for older fields that do not use the shared date component.
  const dateInputs = document.querySelectorAll(
    'input[name="vencimento"]:not([data-date-mask]), input[name="data_pagamento"]:not([data-date-mask])',
  ) as NodeListOf<HTMLInputElement>;
  dateInputs.forEach((input) => {
    input.addEventListener('input', (e) => {
      let v = (e.target as HTMLInputElement).value
        .replace(/\D/g, '')
        .slice(0, 8);
      if (v.length >= 5) {
        v = v.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
      } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{0,2})/, '$1/$2');
      }
      (e.target as HTMLInputElement).value = v;
    });
  });

  const phoneInputs = document.querySelectorAll(
    'input[name="telefone"]',
  ) as NodeListOf<HTMLInputElement>;
  phoneInputs.forEach((input) => {
    input.addEventListener('input', (e) => {
      let v = (e.target as HTMLInputElement).value
        .replace(/\D/g, '')
        .slice(0, 11);
      if (v.length >= 7) {
        v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
      } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
      } else if (v.length >= 1) {
        v = v.replace(/(\d{0,2})/, '($1');
      }
      (e.target as HTMLInputElement).value = v.trim();
    });
  });

  const servidorSelect = document.querySelector(
    '[data-valor-cred-select]',
  ) as HTMLSelectElement;
  if (servidorSelect) {
    servidorSelect.addEventListener('change', () => {
      const selected = servidorSelect.options[servidorSelect.selectedIndex];
      const valorCred = selected
        ? selected.getAttribute('data-valor-cred')
        : '';
      const telasInput = document.querySelector(
        'input[name="telas"]',
      ) as HTMLInputElement;
      const custoTotalInput = document.querySelector(
        '[data-custo-total]',
      ) as HTMLInputElement;
      const telas = telasInput ? parseInt(telasInput.value || '1', 10) : 1;
      if (custoTotalInput && valorCred !== null) {
        const base = parseFloat(
          (valorCred || '0').toString().replace(',', '.'),
        );
        const total = (base * (isNaN(telas) ? 1 : telas))
          .toFixed(2)
          .replace('.', ',');
        custoTotalInput.value = total;
      }
    });
  }

  // Limpa o poll da tela anterior (evita acumular intervals a cada navegacao pjax).
  if (window.__waSessoesInterval) {
    clearInterval(window.__waSessoesInterval);
    window.__waSessoesInterval = null;
  }
  if (document.body.classList.contains('page-whatsapp_sessoes')) {
    const refreshSessionCards = async () => {
      try {
        const formData = new FormData();
        formData.set('action', 'refresh_sessoes');
        const res = await fetch(window.location.href, {
          method: 'POST',
          headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'x-csrf-token': window.getCsrfToken ? window.getCsrfToken() : '',
          },
          body: formData,
        });
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.items)) return;

        data.items.forEach((item) => {
          const card = document.querySelector(
            '[data-wa-card-id="' + item.id + '"]',
          ) as HTMLElement;
          if (!card) return;
          const isOn = (item.status || '').toLowerCase() === 'conectado';
          const cover = card.querySelector('.wa-cover') as HTMLElement;
          const badge = card.querySelector(
            '[data-wa-status-badge]',
          ) as HTMLElement;
          const phoneRow = card.querySelector(
            '[data-wa-phone-row]',
          ) as HTMLElement;
          const phoneEl = card.querySelector('[data-wa-phone]') as HTMLElement;

          if (cover) cover.textContent = isOn ? 'ONLINE' : 'OFFLINE';
          if (badge) {
            badge.textContent = isOn ? 'Conectado' : 'Desconectado';
            badge.classList.remove('badge-green', 'badge-red');
            badge.classList.add(isOn ? 'badge-green' : 'badge-red');
          }
          if (phoneRow && phoneEl) {
            const phone = (item.telefone || '').trim();
            if (phone) {
              phoneEl.textContent = phone;
              phoneRow.style.display = '';
            } else {
              phoneEl.textContent = '';
              phoneRow.style.display = 'none';
            }
          }
        });
      } catch (err) {
        // Silent fail: auto-refresh should not interrupt user interaction.
      }
    };

    setTimeout(refreshSessionCards, 1500);
    window.__waSessoesInterval = setInterval(refreshSessionCards, 10000);
  }
}

// Executa na carga inicial; expoe pro pjax re-inicializar a pagina apos cada swap.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGestor);
} else {
  initGestor();
}
window.__gestorInitPage = initGestor;
