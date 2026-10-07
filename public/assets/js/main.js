function initGestor() {
  // Texto dinâmico do modal de plano
  var planoInfo = document.querySelector('[data-plano-info]');
  if (planoInfo) {
    var pPer = document.querySelector('#modal-add-plano-form [name="periodo"]');
    var pCred = document.querySelector(
      '#modal-add-plano-form [name="creditos"]',
    );
    var pTipo = document.querySelector('#modal-add-plano-form [name="tipo"]');
    var pLabel = document.querySelector('[data-plano-periodo-label]');
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
    );
    element.replaceChildren();
    if (template) element.append(template.content.cloneNode(true));
    if (label) element.append(document.createTextNode(' ' + label));
  };
  document.querySelectorAll('[data-password-field]').forEach((field) => {
    const input = field.querySelector('input');
    const toggle = field.querySelector('[data-password-toggle]');
    const feedback = field.querySelector('[data-password-feedback]');
    const reset = () => {
      input.type = 'password';
      toggle.setAttribute('aria-label', 'Mostrar senha');
      toggle.title = 'Mostrar senha';
      toggle.setAttribute('aria-pressed', 'false');
      const label = toggle.querySelector('[data-password-toggle-label]');
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
      const label = toggle.querySelector('[data-password-toggle-label]');
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
  const on = (target, type, handler, opts) => {
    let o = opts;
    if (o === true) o = { capture: true };
    else if (o === false || o == null) o = {};
    if (__sig) o = Object.assign({}, o, { signal: __sig });
    target.addEventListener(type, handler, o);
  };

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
      const btn = e.target.closest(
        'button[data-loading-text], input[data-loading-text]',
      );
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
        ? document.getElementById(formId)
        : btn.closest('form');
      if (!form) return;
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
    const form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (window.gestorNavigate && form.closest('main.app-content')) return;
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
    const botoes = new Set();
    form
      .querySelectorAll(
        'button[type="submit"], input[type="submit"], button:not([type])',
      )
      .forEach((b) => botoes.add(b));
    if (form.id) {
      document
        .querySelectorAll(
          'button[type="submit"][form="' +
            form.id +
            '"], input[type="submit"][form="' +
            form.id +
            '"]',
        )
        .forEach((b) => botoes.add(b));
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

  const focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let modalStack = Array.from(document.querySelectorAll('.modal-overlay.open'));
  const getOpenModals = () =>
    Array.from(document.querySelectorAll('.modal-overlay.open'));
  const getTopOpenModal = () => {
    modalStack = modalStack.filter(
      (modal) => modal.isConnected && modal.classList.contains('open'),
    );
    getOpenModals().forEach((modal) => {
      if (!modalStack.includes(modal)) modalStack.push(modal);
    });
    return modalStack[modalStack.length - 1] || null;
  };
  const syncModalViewport = () => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    if (getOpenModals().length && viewport && viewport.scale === 1) {
      root.style.setProperty('--modal-viewport-height', viewport.height + 'px');
      root.style.setProperty('--modal-viewport-top', viewport.offsetTop + 'px');
    } else {
      root.style.removeProperty('--modal-viewport-height');
      root.style.removeProperty('--modal-viewport-top');
    }
  };
  if (window.visualViewport) {
    on(window.visualViewport, 'resize', syncModalViewport);
    on(window.visualViewport, 'scroll', syncModalViewport);
  }
  const syncModalUiState = () => {
    const hasOpenModal = getOpenModals().length > 0;
    document.body.classList.toggle('modal-open', hasOpenModal);
    document.documentElement.classList.toggle('modal-open', hasOpenModal);
    const topModal = getTopOpenModal();
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      const isOpen = overlay.classList.contains('open');
      const isTop = overlay === topModal;
      overlay.setAttribute('aria-hidden', isTop ? 'false' : 'true');
      overlay.style.zIndex = isOpen
        ? String(2000 + modalStack.indexOf(overlay))
        : '';
      if (isTop) {
        overlay.removeAttribute('inert');
      } else {
        overlay.setAttribute('inert', '');
      }
    });
    syncModalViewport();
  };

  document.querySelectorAll('.modal-overlay').forEach((overlay, index) => {
    const dialog = overlay.querySelector('.modal');
    if (!dialog) return;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('tabindex', '-1');
    const heading = dialog.querySelector('.modal-header h3');
    if (heading) {
      if (!heading.id)
        heading.id = (overlay.id || 'dialog-' + index) + '-heading';
      dialog.setAttribute('aria-labelledby', heading.id);
    }
  });

  const setModalState = (modal, isOpen, triggerSelector = null) => {
    if (!modal) return;
    if (isOpen) {
      const wasOpen = modal.classList.contains('open');
      modalStack = modalStack.filter((item) => item !== modal);
      modalStack.push(modal);
      if (!triggerSelector && document.activeElement instanceof HTMLElement) {
        modal._lastFocusedEl = document.activeElement;
      }
      // Fecha o teclado da pesquisa antes de transferir o foco ao modal.
      if (
        document.activeElement instanceof HTMLElement &&
        document.activeElement.matches('[data-search-input]')
      ) {
        document.activeElement.blur();
      }
      modal.classList.add('open');
      modal.setAttribute('aria-hidden', 'false');
      modal.removeAttribute('inert');
      if (triggerSelector) modal.dataset.lastTrigger = triggerSelector;
      syncModalUiState();
      const body = modal.querySelector('.modal-body');
      if (body && !wasOpen) body.scrollTop = 0;
      const focusable =
        Array.from(modal.querySelectorAll(focusableSelector)).find(
          (el) => el.offsetParent !== null,
        ) || modal.querySelector('.modal');
      if (focusable) focusable.focus({ preventScroll: true });
    } else {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      modal.setAttribute('inert', '');
      syncModalUiState();
      if (modal.contains(document.activeElement)) {
        document.activeElement.blur();
      }
      const remainingModal = getTopOpenModal();
      if (remainingModal) {
        const previous = modal._lastFocusedEl;
        const target =
          previous && remainingModal.contains(previous)
            ? previous
            : remainingModal.querySelector(focusableSelector);
        if (target) target.focus({ preventScroll: true });
      } else if (modal.dataset.lastTrigger) {
        const el = document.querySelector(modal.dataset.lastTrigger);
        if (el) el.focus({ preventScroll: true });
      } else if (
        modal._lastFocusedEl &&
        typeof modal._lastFocusedEl.focus === 'function'
      ) {
        modal._lastFocusedEl.focus({ preventScroll: true });
      }
    }
  };

  window.gestorSetModalState = setModalState;
  const siteNotice = document.querySelector('[data-auto-notice]');
  if (siteNotice) setModalState(siteNotice, true);
  const accessModal = document.getElementById('modal-client-access');
  if (accessModal) {
    let accessId = null;
    let accessBlocked = false;
    let busy = false;
    const notice = accessModal.querySelector('[data-access-notice]');
    const actions = accessModal.querySelector('[data-access-actions]');
    const toggle = accessModal.querySelector('[data-access-toggle]');
    const revoke = accessModal.querySelector('[data-access-revoke]');
    const copyLink = accessModal.querySelector('[data-access-copy]');
    const linkInput = accessModal.querySelector('[data-access-link]');
    const loadAccess = async (id) => {
      const r = await fetch('/acessos-clientes?cliente=' + id, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!r.ok || !r.headers.get('content-type')?.includes('application/json'))
        throw Error(
          'Não foi possível carregar o acesso. Recarregue a página e tente novamente.',
        );
      const c = await r.json();
      if (accessId !== id) return;
      accessBlocked = c.blocked;
      accessModal
        .querySelector('[data-access-state]')
        .classList.toggle('is-blocked', c.blocked);
      copyLink.disabled = c.blocked;
      accessModal.querySelector('[data-access-name]').textContent = c.nome;
      accessModal.querySelector('[data-access-user]').textContent =
        'Usuário IPTV: ' + c.user;
      accessModal.querySelector('[data-access-state]').textContent = c.blocked
        ? 'Desativado'
        : 'Habilitado';
      toggle.textContent = c.blocked ? 'Habilitar acesso' : 'Desativar acesso';
      revoke.disabled = !c.hasLink;
      actions.hidden = false;
    };
    on(document, 'click', async (event) => {
      const trigger = event.target.closest('[data-client-access]');
      if (!trigger || busy) return;
      accessId = trigger.getAttribute('data-client-access');
      linkInput.value = '';
      linkInput.hidden = true;
      actions.hidden = true;
      accessModal.querySelector('[data-access-name]').textContent = '';
      accessModal.querySelector('[data-access-user]').textContent = '';
      accessModal.querySelector('[data-access-state]').textContent = '';
      notice.textContent = 'Carregando…';
      setModalState(accessModal, true);
      try {
        await loadAccess(accessId);
        notice.textContent = '';
      } catch (e) {
        notice.textContent = e.message;
      }
    });
    const saveAccess = async (action) => {
      if (busy) return;
      busy = true;
      toggle.disabled = revoke.disabled = true;
      notice.textContent = 'Salvando…';
      try {
        const body = new URLSearchParams({
          id: accessId,
          action,
          _csrf: accessModal.querySelector('[name="_csrf"]').value,
        });
        const r = await fetch('/acessos-clientes', {
          method: 'POST',
          body,
          headers: { Accept: 'application/json' },
        });
        if (
          !r.ok ||
          !r.headers.get('content-type')?.includes('application/json')
        )
          throw Error(
            'Não foi possível salvar. Recarregue a página e tente novamente.',
          );
        const result = await r.json();
        linkInput.value = '';
        linkInput.hidden = true;
        await loadAccess(accessId);
        notice.textContent = result.message;
      } catch (e) {
        notice.textContent = e.message;
      } finally {
        busy = false;
        toggle.disabled = false;
      }
    };
    toggle.onclick = () => saveAccess(accessBlocked ? 'enable' : 'disable');
    revoke.onclick = () => saveAccess('revoke-link');
    copyLink.onclick = async () => {
      if (busy || accessBlocked) return;
      busy = true;
      copyLink.disabled = toggle.disabled = revoke.disabled = true;
      notice.textContent = 'Preparando link…';
      try {
        const r = await fetch('/clientes/' + accessId + '/link-pagamento', {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        if (
          !r.ok ||
          !r.headers.get('content-type')?.includes('application/json')
        )
          throw Error('Não foi possível obter o link. Tente novamente.');
        const result = await r.json();
        if (!result.ok || !result.url)
          throw Error(result.error || 'Link indisponível.');
        linkInput.value = result.url;
        linkInput.hidden = false;
        await loadAccess(accessId);
        try {
          await navigator.clipboard.writeText(result.url);
          notice.textContent = 'Link de acesso copiado!';
        } catch {
          linkInput.focus();
          linkInput.select();
          notice.textContent = 'Selecione e copie o link no campo acima.';
        }
      } catch (e) {
        notice.textContent = e.message;
      } finally {
        busy = false;
        copyLink.disabled = accessBlocked;
        toggle.disabled = false;
      }
    };
  }

  const showNoticeModal = (message, type = 'success') => {
    const modal = document.getElementById('modal-notice');
    const msg = document.getElementById('modal-notice-message');
    if (!modal || !msg) return false;
    msg.textContent = message;
    msg.classList.remove('success', 'error');
    msg.classList.add(type === 'error' ? 'error' : 'success');
    setModalState(modal, true);
    return true;
  };
  const pendingNotice = document.querySelector(
    '#modal-notice[data-open-notice]',
  );
  if (pendingNotice) {
    pendingNotice.removeAttribute('data-open-notice');
    setModalState(pendingNotice, true);
  }
  const dropdowns = document.querySelectorAll('[data-dropdown]');
  dropdowns.forEach((d) => {
    const trigger = d.querySelector('.nav-trigger');
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

  const hamburger = document.querySelector('[data-hamburger]');
  const nav = document.querySelector('[data-nav]');
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      nav.classList.toggle('open');
    });
  }

  // Alternância de tema claro/escuro (persistido em localStorage).
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
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

  document.querySelectorAll('[data-switch] input').forEach((input) => {
    input.addEventListener('change', () => {
      const status = input
        .closest('[data-switch]')
        .querySelector('.switch-status');
      status.textContent = input.checked ? 'Ativa' : 'Inativa';
    });
  });

  const phonePrefixes = [
    ['+93', 'Afeganistão'],
    ['+355', 'Albânia'],
    ['+213', 'Argélia'],
    ['+1684', 'Samoa Americana'],
    ['+376', 'Andorra'],
    ['+244', 'Angola'],
    ['+1264', 'Anguilla'],
    ['+1268', 'Antígua e Barbuda'],
    ['+54', 'Argentina'],
    ['+374', 'Armênia'],
    ['+297', 'Aruba'],
    ['+61', 'Austrália'],
    ['+43', 'Áustria'],
    ['+994', 'Azerbaijão'],
    ['+1242', 'Bahamas'],
    ['+973', 'Bahrein'],
    ['+880', 'Bangladesh'],
    ['+1246', 'Barbados'],
    ['+375', 'Belarus'],
    ['+32', 'Bélgica'],
    ['+501', 'Belize'],
    ['+229', 'Benin'],
    ['+1441', 'Bermudas'],
    ['+975', 'Butão'],
    ['+591', 'Bolívia'],
    ['+387', 'Bósnia e Herzegovina'],
    ['+267', 'Botsuana'],
    ['+55', 'Brasil'],
    ['+246', 'Território Britânico do Oceano Índico'],
    ['+673', 'Brunei'],
    ['+359', 'Bulgária'],
    ['+226', 'Burkina Faso'],
    ['+257', 'Burundi'],
    ['+855', 'Camboja'],
    ['+237', 'Camarões'],
    ['+1', 'Canadá / Estados Unidos'],
    ['+238', 'Cabo Verde'],
    ['+1345', 'Ilhas Cayman'],
    ['+236', 'República Centro-Africana'],
    ['+235', 'Chade'],
    ['+56', 'Chile'],
    ['+86', 'China'],
    ['+57', 'Colômbia'],
    ['+269', 'Comores'],
    ['+242', 'Congo'],
    ['+243', 'República Democrática do Congo'],
    ['+682', 'Ilhas Cook'],
    ['+506', 'Costa Rica'],
    ['+225', 'Costa do Marfim'],
    ['+385', 'Croácia'],
    ['+53', 'Cuba'],
    ['+599', 'Curaçao / Caribe Neerlandês'],
    ['+357', 'Chipre'],
    ['+420', 'Tchéquia'],
    ['+45', 'Dinamarca'],
    ['+253', 'Djibuti'],
    ['+1767', 'Dominica'],
    ['+1809', 'República Dominicana'],
    ['+1829', 'República Dominicana'],
    ['+1849', 'República Dominicana'],
    ['+593', 'Equador'],
    ['+20', 'Egito'],
    ['+503', 'El Salvador'],
    ['+240', 'Guiné Equatorial'],
    ['+291', 'Eritreia'],
    ['+372', 'Estônia'],
    ['+268', 'Essuatíni'],
    ['+251', 'Etiópia'],
    ['+500', 'Ilhas Malvinas'],
    ['+298', 'Ilhas Faroe'],
    ['+679', 'Fiji'],
    ['+358', 'Finlândia'],
    ['+33', 'França'],
    ['+594', 'Guiana Francesa'],
    ['+689', 'Polinésia Francesa'],
    ['+241', 'Gabão'],
    ['+220', 'Gâmbia'],
    ['+995', 'Geórgia'],
    ['+49', 'Alemanha'],
    ['+233', 'Gana'],
    ['+350', 'Gibraltar'],
    ['+30', 'Grécia'],
    ['+299', 'Groenlândia'],
    ['+1473', 'Granada'],
    ['+590', 'Guadalupe / São Bartolomeu / São Martinho'],
    ['+1671', 'Guam'],
    ['+502', 'Guatemala'],
    ['+44', 'Reino Unido / Guernsey / Ilha de Man / Jersey'],
    ['+224', 'Guiné'],
    ['+245', 'Guiné-Bissau'],
    ['+592', 'Guiana'],
    ['+509', 'Haiti'],
    ['+504', 'Honduras'],
    ['+852', 'Hong Kong'],
    ['+36', 'Hungria'],
    ['+354', 'Islândia'],
    ['+91', 'Índia'],
    ['+62', 'Indonésia'],
    ['+98', 'Irã'],
    ['+964', 'Iraque'],
    ['+353', 'Irlanda'],
    ['+972', 'Israel'],
    ['+39', 'Itália / Vaticano'],
    ['+1876', 'Jamaica'],
    ['+81', 'Japão'],
    ['+962', 'Jordânia'],
    ['+7', 'Rússia / Cazaquistão'],
    ['+254', 'Quênia'],
    ['+686', 'Kiribati'],
    ['+850', 'Coreia do Norte'],
    ['+82', 'Coreia do Sul'],
    ['+965', 'Kuwait'],
    ['+996', 'Quirguistão'],
    ['+856', 'Laos'],
    ['+371', 'Letônia'],
    ['+961', 'Líbano'],
    ['+266', 'Lesoto'],
    ['+231', 'Libéria'],
    ['+218', 'Líbia'],
    ['+423', 'Liechtenstein'],
    ['+370', 'Lituânia'],
    ['+352', 'Luxemburgo'],
    ['+853', 'Macau'],
    ['+261', 'Madagascar'],
    ['+265', 'Malawi'],
    ['+60', 'Malásia'],
    ['+960', 'Maldivas'],
    ['+223', 'Mali'],
    ['+356', 'Malta'],
    ['+692', 'Ilhas Marshall'],
    ['+596', 'Martinica'],
    ['+222', 'Mauritânia'],
    ['+230', 'Maurício'],
    ['+262', 'Mayotte / Reunião'],
    ['+52', 'México'],
    ['+691', 'Micronésia'],
    ['+373', 'Moldávia'],
    ['+377', 'Mônaco'],
    ['+976', 'Mongólia'],
    ['+382', 'Montenegro'],
    ['+1664', 'Montserrat'],
    ['+212', 'Marrocos'],
    ['+258', 'Moçambique'],
    ['+95', 'Myanmar'],
    ['+264', 'Namíbia'],
    ['+674', 'Nauru'],
    ['+977', 'Nepal'],
    ['+31', 'Países Baixos'],
    ['+687', 'Nova Caledônia'],
    ['+64', 'Nova Zelândia'],
    ['+505', 'Nicarágua'],
    ['+227', 'Níger'],
    ['+234', 'Nigéria'],
    ['+683', 'Niue'],
    ['+672', 'Norfolk / Antártida Australiana'],
    ['+389', 'Macedônia do Norte'],
    ['+1670', 'Ilhas Marianas do Norte'],
    ['+47', 'Noruega / Svalbard'],
    ['+968', 'Omã'],
    ['+92', 'Paquistão'],
    ['+680', 'Palau'],
    ['+970', 'Palestina'],
    ['+507', 'Panamá'],
    ['+675', 'Papua-Nova Guiné'],
    ['+595', 'Paraguai'],
    ['+51', 'Peru'],
    ['+63', 'Filipinas'],
    ['+48', 'Polônia'],
    ['+351', 'Portugal'],
    ['+1787', 'Porto Rico'],
    ['+1939', 'Porto Rico'],
    ['+974', 'Catar'],
    ['+40', 'Romênia'],
    ['+250', 'Ruanda'],
    ['+290', 'Santa Helena'],
    ['+1869', 'São Cristóvão e Névis'],
    ['+1758', 'Santa Lúcia'],
    ['+508', 'Saint Pierre e Miquelon'],
    ['+1784', 'São Vicente e Granadinas'],
    ['+685', 'Samoa'],
    ['+378', 'San Marino'],
    ['+239', 'São Tomé e Príncipe'],
    ['+966', 'Arábia Saudita'],
    ['+221', 'Senegal'],
    ['+381', 'Sérvia'],
    ['+248', 'Seychelles'],
    ['+232', 'Serra Leoa'],
    ['+65', 'Singapura'],
    ['+421', 'Eslováquia'],
    ['+386', 'Eslovênia'],
    ['+677', 'Ilhas Salomão'],
    ['+252', 'Somália'],
    ['+27', 'África do Sul'],
    ['+211', 'Sudão do Sul'],
    ['+34', 'Espanha'],
    ['+94', 'Sri Lanka'],
    ['+249', 'Sudão'],
    ['+597', 'Suriname'],
    ['+46', 'Suécia'],
    ['+41', 'Suíça'],
    ['+963', 'Síria'],
    ['+886', 'Taiwan'],
    ['+992', 'Tajiquistão'],
    ['+255', 'Tanzânia'],
    ['+66', 'Tailândia'],
    ['+670', 'Timor-Leste'],
    ['+228', 'Togo'],
    ['+690', 'Tokelau'],
    ['+676', 'Tonga'],
    ['+1868', 'Trinidad e Tobago'],
    ['+216', 'Tunísia'],
    ['+90', 'Turquia'],
    ['+993', 'Turcomenistão'],
    ['+1649', 'Turks e Caicos'],
    ['+688', 'Tuvalu'],
    ['+256', 'Uganda'],
    ['+380', 'Ucrânia'],
    ['+971', 'Emirados Árabes Unidos'],
    ['+598', 'Uruguai'],
    ['+998', 'Uzbequistão'],
    ['+678', 'Vanuatu'],
    ['+58', 'Venezuela'],
    ['+84', 'Vietnã'],
    ['+1284', 'Ilhas Virgens Britânicas'],
    ['+1340', 'Ilhas Virgens Americanas'],
    ['+681', 'Wallis e Futuna'],
    ['+967', 'Iêmen'],
    ['+260', 'Zâmbia'],
    ['+263', 'Zimbábue'],
  ];

  const normalizePrefixValue = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    return digits ? '+' + digits : '+55';
  };

  const findPrefixFromPhone = (value) => {
    const digits = String(value || '').replace(/\D+/g, '');
    const sorted = phonePrefixes
      .map((item) => item[0])
      .sort((a, b) => b.length - a.length);
    return (
      sorted.find((prefix) => digits.startsWith(prefix.replace(/\D+/g, ''))) ||
      '+55'
    );
  };

  const setPhonePrefix = (box, prefix) => {
    if (!box) return;
    const normalized = normalizePrefixValue(prefix);
    const btn = box.querySelector('[data-phone-prefix-toggle]');
    const input = box.querySelector('[data-phone-prefix-value]');
    if (btn) btn.textContent = normalized;
    if (input) input.value = normalized;
  };

  const getPhonePrefix = (input) => {
    const box =
      input && input.closest('.phone-control')
        ? input.closest('.phone-control').querySelector('[data-phone-prefix]')
        : null;
    const value = box ? box.querySelector('[data-phone-prefix-value]') : null;
    return normalizePrefixValue(value ? value.value : '+55');
  };

  const stripPhonePrefix = (value, prefix) => {
    let digits = String(value || '').replace(/\D+/g, '');
    const prefixDigits = normalizePrefixValue(prefix).replace(/\D+/g, '');
    if (digits.startsWith(prefixDigits) && digits.length > prefixDigits.length)
      digits = digits.slice(prefixDigits.length);
    return digits;
  };

  const formatPhoneValue = (value, prefix = '+55') => {
    let digits = stripPhonePrefix(value, prefix);
    if (normalizePrefixValue(prefix) !== '+55') {
      digits = digits.slice(0, 15);
      return digits.replace(/(\d{3})(?=\d)/g, '$1 ').trim();
    }
    digits = digits.slice(0, 11);
    if (digits.length <= 2) return digits ? '(' + digits : '';
    if (digits.length <= 6)
      return '(' + digits.slice(0, 2) + ') ' + digits.slice(2);
    if (digits.length <= 10)
      return (
        '(' +
        digits.slice(0, 2) +
        ') ' +
        digits.slice(2, 6) +
        '-' +
        digits.slice(6)
      );
    return (
      '(' +
      digits.slice(0, 2) +
      ') ' +
      digits.slice(2, 7) +
      '-' +
      digits.slice(7)
    );
  };

  const formatPhoneInput = (input) => {
    if (!input) return;
    input.value = formatPhoneValue(input.value, getPhonePrefix(input));
  };

  const initPhonePrefixSelect = () => {
    document.querySelectorAll('[data-phone-prefix]').forEach((box) => {
      const btn = box.querySelector('[data-phone-prefix-toggle]');
      const hidden = box.querySelector('[data-phone-prefix-value]');
      const menu = box.querySelector('.phone-prefix-menu');
      const search = box.querySelector('[data-phone-prefix-search]');
      const list = box.querySelector('[data-phone-prefix-list]');
      const phoneInput = box.closest('.phone-control')
        ? box.closest('.phone-control').querySelector('[data-phone-mask]')
        : null;
      if (!btn || !hidden || !menu || !list) return;

      const closeMenu = () => {
        box.classList.remove('open');
        menu.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      };
      const render = (term = '') => {
        const normalized = term
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        list.innerHTML = '';
        phonePrefixes
          .filter(([prefix, country]) =>
            (prefix + ' ' + country)
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .includes(normalized),
          )
          .forEach(([prefix, country]) => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className =
              'phone-prefix-option' +
              (hidden.value === prefix ? ' active' : '');
            option.innerHTML =
              '<strong>' +
              prefix +
              '</strong><span class="phone-prefix-country">' +
              country +
              '</span>';
            option.addEventListener('click', () => {
              const oldPrefix = hidden.value;
              setPhonePrefix(box, prefix);
              if (phoneInput && oldPrefix !== prefix)
                formatPhoneInput(phoneInput);
              closeMenu();
            });
            list.appendChild(option);
          });
      };

      setPhonePrefix(box, hidden.value || '+55');
      render();
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = menu.hidden;
        document
          .querySelectorAll('[data-phone-prefix] .phone-prefix-menu')
          .forEach((other) => {
            other.hidden = true;
          });
        document
          .querySelectorAll('[data-phone-prefix]')
          .forEach((other) => other.classList.remove('open'));
        menu.hidden = !open;
        box.classList.toggle('open', open);
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
          render(search ? search.value : '');
          if (search) search.focus();
        }
      });
      if (search) search.addEventListener('input', () => render(search.value));
      on(document, 'click', (e) => {
        if (!box.contains(e.target)) closeMenu();
      });
    });
  };

  initPhonePrefixSelect();

  document.querySelectorAll('[data-phone-mask]').forEach((input) => {
    formatPhoneInput(input);
    input.addEventListener('input', () => formatPhoneInput(input));
    input.addEventListener('paste', () =>
      setTimeout(() => formatPhoneInput(input), 0),
    );
  });

  const formatDateBrValue = (value, completeYear = false) => {
    const text = String(value || '').trim();
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return iso[3] + '/' + iso[2] + '/' + iso[1];
    const digits = text.replace(/\D+/g, '').slice(0, 8);
    if (digits.length <= 2) return digits;
    if (digits.length <= 4) return digits.slice(0, 2) + '/' + digits.slice(2);
    if (completeYear && digits.length === 6)
      return (
        digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/20' + digits.slice(4)
      );
    return (
      digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4)
    );
  };

  const setDateInputValue = (input, value, completeYear = false) => {
    if (!input) return;
    input.value = formatDateBrValue(value, completeYear);
  };

  const isValidDateBrValue = (value) => {
    const match = String(value || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return !String(value || '').trim();
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    return (
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day
    );
  };

  // Aplica mascara preservando a posicao do cursor — assim editar um digito no
  // meio (ex.: trocar so o ano) nao embaralha o campo. Contamos digitos antes
  // do caret, reformatamos, e posicionamos o caret depois do mesmo numero de
  // digitos no valor novo.
  const applyDateMaskKeepCaret = (input) => {
    const original = input.value;
    const selStart = input.selectionStart ?? original.length;
    let digitsBeforeCaret = 0;
    for (let i = 0; i < selStart; i++)
      if (/\d/.test(original[i])) digitsBeforeCaret++;
    const formatted = formatDateBrValue(original);
    if (formatted === original) return;
    input.value = formatted;
    let newCaret = formatted.length;
    let digitsSeen = 0;
    for (let i = 0; i < formatted.length; i++) {
      if (digitsSeen === digitsBeforeCaret) {
        newCaret = i;
        break;
      }
      if (/\d/.test(formatted[i])) digitsSeen++;
    }
    if (digitsSeen < digitsBeforeCaret) newCaret = formatted.length;
    try {
      input.setSelectionRange(newCaret, newCaret);
    } catch (e) {}
  };

  // Overtype: quando o campo ja tem 8 digitos e o usuario digita sobre um
  // digito (caret NAO em selecao), substitui o digito da direita em vez de
  // inserir — evita ter que apagar pra trocar um numero.
  const dateOvertypeKeydown = (input) => (e) => {
    if (!/^\d$/.test(e.key)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const value = input.value;
    if (value.replace(/\D+/g, '').length < 8) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    if (start !== end) return;
    // Encontra o proximo digito a partir do caret pra substituir.
    let pos = start;
    while (pos < value.length && !/\d/.test(value[pos])) pos++;
    if (pos >= value.length) return;
    e.preventDefault();
    const novo = value.slice(0, pos) + e.key + value.slice(pos + 1);
    input.value = novo;
    // Move caret pra depois do digito substituido, pulando separadores.
    let after = pos + 1;
    while (after < novo.length && !/\d/.test(novo[after]) && after < pos + 2)
      after++;
    try {
      input.setSelectionRange(after, after);
    } catch (err) {}
  };

  document.querySelectorAll('[data-date-mask]').forEach((input) => {
    setDateInputValue(input, input.value);
    // Icone de calendario: abre o seletor de data NATIVO e escreve de volta no
    // campo mascarado (mantendo a digitacao manual em dd/mm/aaaa).
    (function addDatePicker(inp) {
      if (inp.dataset.datePicker === '1') return;
      inp.dataset.datePicker = '1';
      const wrap = document.createElement('span');
      wrap.className = 'date-input-wrap';
      inp.parentNode.insertBefore(wrap, inp);
      wrap.appendChild(inp);
      const toIso = (br) => {
        const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
      };
      // Input date nativo TRANSPARENTE por cima do icone (ver CSS). O toque cai
      // direto nele — no iOS e a unica forma do seletor nativo abrir. Ele precisa
      // ser tocavel de verdade, entao NADA de tabIndex -1 / aria-hidden / pointer-
      // events:none aqui (isso mataria o iOS).
      const picker = document.createElement('input');
      picker.type = 'date';
      picker.className = 'date-input-native';
      picker.setAttribute('aria-label', 'Abrir calendário');
      wrap.appendChild(picker);
      // Ícone decorativo (pointer-events:none no CSS) — fica visivel
      // por baixo do input transparente.
      const btn = document.createElement('span');
      btn.className = 'date-input-btn';
      btn.setAttribute('aria-hidden', 'true');
      setIconLabel(btn, 'calendar');
      wrap.appendChild(btn);
      // Sincroniza o mes/dia que o seletor abre com o que ja esta digitado.
      // pointerdown roda ANTES do iOS ler o value e montar a rodinha.
      const syncPickerValue = () => {
        const iso = toIso(inp.value);
        if (iso) picker.value = iso;
      };
      picker.addEventListener('pointerdown', syncPickerValue);
      picker.addEventListener('focus', syncPickerValue);
      // Desktop (Chrome/Edge): um clique simples no input date nao abre o dropdown
      // sozinho — showPicker() resolve. No iOS o proprio toque ja abriu a rodinha e
      // showPicker() lanca; o try/catch engole sem quebrar nada.
      picker.addEventListener('click', () => {
        if (typeof picker.showPicker === 'function') {
          try {
            picker.showPicker();
          } catch (e) {
            /* iOS: ja abriu pelo toque */
          }
        }
      });
      picker.addEventListener('change', () => {
        if (!picker.value) return;
        const p = picker.value.split('-');
        inp.value = p[2] + '/' + p[1] + '/' + p[0];
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('blur', { bubbles: true }));
      });
    })(input);
    input.addEventListener('input', () => applyDateMaskKeepCaret(input));
    input.addEventListener('keydown', dateOvertypeKeydown(input));
    input.addEventListener('paste', () =>
      setTimeout(() => setDateInputValue(input, input.value), 0),
    );
    input.addEventListener('blur', () => {
      setDateInputValue(input, input.value, true);
      input.setCustomValidity(
        isValidDateBrValue(input.value)
          ? ''
          : 'Use uma data válida em dd/mm/aaaa.',
      );
    });
    input.addEventListener('invalid', () => {
      input.setCustomValidity(
        isValidDateBrValue(input.value)
          ? ''
          : 'Use uma data válida em dd/mm/aaaa.',
      );
    });
  });

  // Mapeia o texto do select de "Status" (Ativo / Vence hoje / Vencido / Inativo / Pra vencer)
  // para o `data-vencimento-status` da linha — antes era `text.includes(value)`, que
  // dava match em "Ativo" mesmo para vencido (a palavra "Ativo" aparecia em outras
  // colunas do row).
  const STATUS_TYPE_MAP = {
    ativo: (t) => t === 'nao-vencido',
    'vence hoje': (t) => t === 'today',
    vencido: (t) => t === 'vencido',
    // "Pra vencer" = clientes que vencem em 1 a 3 dias (definido em format.ts).
    'pra vencer': (t) => t === 'pra-vencer',
  };
  const normalizeSearchText = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  const applyTableScopeFilters = (scope) => {
    const input = scope.querySelector('[data-search-input]');
    const selects = Array.from(scope.querySelectorAll('[data-filter-select]'));
    const vencimentoFilter = scope.querySelector('[data-vencimento-filter]');
    const term = normalizeSearchText(input ? input.value : '');
    const activeSelects = selects
      .map((sel) => normalizeSearchText(sel.value))
      .filter(Boolean);
    const vencimentoValue = vencimentoFilter ? vencimentoFilter.value : '';
    const items = scope.querySelectorAll('[data-search-item]');
    let visibleCount = 0;
    items.forEach((item) => {
      const text = normalizeSearchText(
        item.dataset.searchText ?? item.textContent,
      );
      const status = item.dataset.vencimentoStatus || '';
      const matchSearch = !term || text.includes(term);
      const matchSelects = activeSelects.every((value) => {
        // Se o valor do select corresponde a um rótulo de status, casa pelo tipo
        // do badge (data-vencimento-status). Senão, busca o texto na linha.
        const statusMatcher = STATUS_TYPE_MAP[value];
        if (statusMatcher) return statusMatcher(status);
        return text.includes(value);
      });
      const matchVencimento =
        !vencimentoValue ||
        status === vencimentoValue ||
        (vencimentoValue === 'nao-vencido' && status !== 'vencido');
      const visible = matchSearch && matchSelects && matchVencimento;
      item.classList.toggle('hidden', !visible);
      if (visible) visibleCount++;
    });
    const clearSearch = scope.querySelector('[data-clear-search]');
    if (clearSearch) clearSearch.hidden = !input || !input.value;
    const result = scope.querySelector('[data-search-results]');
    if (result) {
      const singular = scope.dataset.searchSingular || 'cliente';
      const plural = scope.dataset.searchPlural || 'clientes';
      result.hidden = !term && !activeSelects.length && !vencimentoValue;
      result.textContent =
        visibleCount === 0
          ? scope.dataset.searchEmpty ||
            'Nenhum cliente encontrado. Tente outro nome ou número.'
          : visibleCount +
            (visibleCount === 1
              ? ' ' + singular + ' encontrado'
              : ' ' + plural + ' encontrados') +
            ' de ' +
            items.length +
            '.';
    }
  };

  // Visual de filtro ativo: marca o wrapper .cli-filter quando o select tem valor,
  // e mostra/esconde o botao "Limpar" baseado em ter algo filtrado. Sem isso, o
  // user nao percebe quais filtros estao aplicados (todos os selects parecem iguais).
  const refreshFilterChips = (scope) => {
    const selects = scope.querySelectorAll('[data-filter-select]');
    let temAlgum = false;
    selects.forEach((sel) => {
      const ativo = !!sel.value;
      const wrap = sel.closest('.cli-filter');
      if (wrap) wrap.classList.toggle('is-active', ativo);
      if (ativo) temAlgum = true;
    });
    const searchInput = scope.querySelector('[data-search-input]');
    if (searchInput && searchInput.value.trim()) temAlgum = true;
    const clearBtn = scope.querySelector('[data-clear-filters]');
    if (clearBtn) clearBtn.classList.toggle('is-visible', temAlgum);
  };

  document.querySelectorAll('[data-search-scope]').forEach((scope) => {
    const input = scope.querySelector('[data-search-input]');
    const selects = Array.from(scope.querySelectorAll('[data-filter-select]'));
    const vencimentoFilter = scope.querySelector('[data-vencimento-filter]');
    const apply = () => {
      applyTableScopeFilters(scope);
      refreshFilterChips(scope);
    };
    if (input) input.addEventListener('input', apply);
    const clearSearch = scope.querySelector('[data-clear-search]');
    if (clearSearch && input)
      clearSearch.addEventListener('click', () => {
        input.value = '';
        apply();
        input.focus({ preventScroll: true });
      });
    selects.forEach((sel) => sel.addEventListener('change', apply));
    if (vencimentoFilter) vencimentoFilter.addEventListener('change', apply);
    refreshFilterChips(scope);
    if (scope.querySelector('[data-search-results]')) apply();
  });

  // Linha selecionada (check da tabela): destaque visual + "selecionar todos" no cabeçalho.
  // Delegado no document pra cobrir rows criadas via AJAX (cadastro/edição inline).
  on(document, 'change', (e) => {
    const t = e.target;
    if (!t || !t.classList || !t.classList.contains('cli-check')) return;
    if (t.hasAttribute('data-check-all')) {
      const table = t.closest('table');
      if (!table) return;
      table.querySelectorAll('tbody tr').forEach((row) => {
        const cb = row.querySelector('input.cli-check');
        if (cb && !row.classList.contains('hidden')) {
          cb.checked = t.checked;
          row.classList.toggle('is-selected', t.checked);
        }
      });
    } else {
      const row = t.closest('tr');
      if (row) row.classList.toggle('is-selected', t.checked);
      // Se desmarcou uma linha, desmarca o "todos" do header.
      const table = t.closest('table');
      const header =
        table && table.querySelector('input.cli-check[data-check-all]');
      if (header && !t.checked) header.checked = false;
    }
  });

  const normalizeSortText = (value) =>
    String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const getSortValue = (row, columnIndex, type) => {
    const cell = row.children[columnIndex];
    const raw = cell ? cell.dataset.sortValue || cell.textContent || '' : '';
    if (type === 'number') {
      return (
        Number(
          String(raw)
            .replace(/[^0-9,-]+/g, '')
            .replace(',', '.'),
        ) || 0
      );
    }
    if (type === 'date') {
      const iso = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso)
        return (
          Number(
            new Date(iso[1] + '-' + iso[2] + '-' + iso[3] + 'T00:00:00'),
          ) || 0
        );
      const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (br)
        return (
          Number(new Date(br[3] + '-' + br[2] + '-' + br[1] + 'T00:00:00')) || 0
        );
      return 0;
    }
    return normalizeSortText(raw);
  };

  document.querySelectorAll('table').forEach((table) => {
    table
      .querySelectorAll('tbody tr[data-search-item]')
      .forEach((row, index) => {
        row.dataset.originalIndex = String(index);
      });
  });

  const clearSortButtons = (table) => {
    table.querySelectorAll('[data-sort-toggle]').forEach((other) => {
      other.classList.remove('active', 'asc', 'desc');
      other.removeAttribute('data-sort-state');
    });
  };

  const restoreOriginalTableOrder = (tbody) => {
    Array.from(tbody.querySelectorAll('tr[data-search-item]'))
      .sort(
        (a, b) =>
          Number(a.dataset.originalIndex || 0) -
          Number(b.dataset.originalIndex || 0),
      )
      .forEach((row) => tbody.appendChild(row));
  };

  document.querySelectorAll('[data-sort-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const table = document.querySelector(btn.dataset.sortTable);
      const tbody = table ? table.querySelector('tbody') : null;
      if (!tbody) return;

      const currentState = btn.dataset.sortState || '';
      const nextState =
        currentState === '' ? 'asc' : currentState === 'asc' ? 'desc' : '';
      const column = Number(btn.dataset.sortColumn || 0);
      const type = btn.dataset.sortType || 'text';

      clearSortButtons(table);

      if (!nextState) {
        restoreOriginalTableOrder(tbody);
        return;
      }

      const direction = nextState === 'desc' ? -1 : 1;
      const rows = Array.from(tbody.querySelectorAll('tr[data-search-item]'));
      rows
        .sort((a, b) => {
          const aValue = getSortValue(a, column, type);
          const bValue = getSortValue(b, column, type);
          if (aValue < bValue) return -1 * direction;
          if (aValue > bValue) return 1 * direction;
          return (
            Number(a.dataset.originalIndex || 0) -
            Number(b.dataset.originalIndex || 0)
          );
        })
        .forEach((row) => tbody.appendChild(row));

      btn.dataset.sortState = nextState;
      btn.classList.add('active', nextState);
    });
  });

  document.querySelectorAll('[data-clear-filters]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const scope = btn.closest('[data-search-scope]') || document;
      scope
        .querySelectorAll('[data-filter-select], [data-vencimento-filter]')
        .forEach((sel) => {
          sel.selectedIndex = 0;
        });
      scope.querySelectorAll('[data-search-input]').forEach((input) => {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      applyTableScopeFilters(scope);
      if (typeof refreshFilterChips === 'function') refreshFilterChips(scope);
    });
  });

  on(document, 'click', (event) => {
    const btn = event.target.closest('[data-open-modal]');
    if (!btn) return;
    event.preventDefault();
    const id = btn.getAttribute('data-open-modal');
    const modal = document.getElementById(id);
    if (modal) {
      if (id === 'modal-add-plano') {
        const form = modal.querySelector('#modal-add-plano-form');
        if (form) {
          form.reset();
          form.querySelector('[name="action"]').value = 'create_plano';
          form.querySelector('[name="id"]').value = '';
        }
      }
      if (id === 'modal-add-cliente') {
        const form = modal.querySelector('#modal-add-cliente-form');
        if (form) {
          form.reset();
          form.querySelector('[name="action"]').value = 'create_cliente';
          form.querySelector('[name="id"]').value = '';
          form.querySelector('[name="status"]').value = 'Ativo';
          setPhonePrefix(form.querySelector('[data-phone-prefix]'), '+55');
          setTimeout(() => syncClienteUsageFields(form), 0);
        }
      }
      if (id === 'modal-add-servidor') {
        const form = modal.querySelector('#modal-add-servidor-form');
        if (form) {
          form.reset();
          form.querySelector('[name="action"]').value = 'create_servidor';
          form.querySelector('[name="id"]').value = '';
        }
      }
      if (id === 'modal-add-cobranca') {
        const form = modal.querySelector('#modal-add-cobranca-form');
        if (form) {
          form.reset();
          form.querySelector('[name="action"]').value = 'create_cobranca';
          form.querySelector('[name="id"]').value = '';
          const title = modal.querySelector('#cobranca-title');
          if (title) title.textContent = 'Adicionar Cobrança';
        }
      }
      if (id === 'modal-add-mensagem') {
        const form = modal.querySelector('#modal-add-mensagem-form');
        if (form) {
          form.reset();
          form.querySelector('[name="action"]').value = 'create_mensagem';
          form.querySelector('[name="id"]').value = '';
          const title = modal.querySelector('.modal-header h3');
          if (title) setIconLabel(title, 'plus', 'Novo Template');
        }
      }
      const triggerSelector = '[data-open-modal="' + id + '"]';
      setModalState(modal, true, triggerSelector);
    }
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const overlay = btn.closest('.modal-overlay');
      if (overlay) setModalState(overlay, false);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    let pointerStartedOnBackdrop = false;
    overlay.addEventListener('pointerdown', (e) => {
      pointerStartedOnBackdrop = e.target === overlay;
    });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && pointerStartedOnBackdrop) {
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
      topModal.querySelectorAll(focusableSelector),
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

  document.querySelectorAll('.modal').forEach((modal) => {
    const tabs = modal.querySelectorAll('.tab-btn');
    const panels = modal.querySelectorAll('.tab-panel');
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-tab');
        tabs.forEach((t) => t.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = modal.querySelector('[data-tab-panel=\"' + key + '\"]');
        if (panel) panel.classList.add('active');
      });
    });
  });

  document.querySelectorAll('.edit-plano').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-plano');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-plano-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_plano';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="tipo"]').value = /m[eê]s/i.test(
        btn.getAttribute('data-tipo') || '',
      )
        ? 'Meses'
        : 'Dias';
      form.querySelector('[name="periodo"]').value =
        btn.getAttribute('data-periodo') || '1';
      form.querySelector('[name="observacao"]').value =
        btn.getAttribute('data-observacao') || '';
      const pCred = form.querySelector('[name="creditos"]');
      if (pCred) pCred.value = btn.getAttribute('data-creditos') || '0';
      const pAtivo = form.querySelector('[name="ativo"]');
      if (pAtivo) pAtivo.checked = btn.getAttribute('data-ativo') !== '0';
      const pSigPkg = form.querySelector('[name="sigma_package_id"]');
      if (pSigPkg)
        pSigPkg.value = btn.getAttribute('data-sigma-package-id') || '';
      const pSigConn = form.querySelector('[name="sigma_connections"]');
      if (pSigConn)
        pSigConn.value = btn.getAttribute('data-sigma-connections') || '1';
      const pTitulo = modal.querySelector('.modal-header h3');
      if (pTitulo) setIconLabel(pTitulo, 'edit', 'Editar Plano');
      const pBtnEd = document.querySelector(
        'button[type="submit"][form="modal-add-plano-form"]',
      );
      if (pBtnEd) pBtnEd.textContent = 'Salvar';
      const pInfoUpd = form.querySelector('[name="periodo"]');
      if (pInfoUpd)
        pInfoUpd.dispatchEvent(new Event('input', { bubbles: true }));
      setModalState(modal, true);
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-plano"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-plano-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_plano';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
          form
            .querySelector('[name="periodo"]')
            .dispatchEvent(new Event('input', { bubbles: true }));
        }
        const t = document.querySelector('#modal-add-plano .modal-header h3');
        if (t) setIconLabel(t, 'plus', 'Novo Plano');
        const pBtnNv = document.querySelector(
          'button[type="submit"][form="modal-add-plano-form"]',
        );
        if (pBtnNv) pBtnNv.textContent = 'Cadastrar';
      });
    });

  document.querySelectorAll('.edit-dispositivo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-dispositivo');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-dispositivo-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_dispositivo';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="descricao"]').value =
        btn.getAttribute('data-descricao') || '';
      const dStatus = form.querySelector('[name="status"]');
      if (dStatus) dStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const dTit = modal.querySelector('.modal-header h3');
      if (dTit) setIconLabel(dTit, 'edit', 'Editar Dispositivo');
      setModalState(modal, true);
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-dispositivo"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-dispositivo-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_dispositivo';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const t = document.querySelector(
          '#modal-add-dispositivo .modal-header h3',
        );
        if (t) setIconLabel(t, 'plus', 'Novo Dispositivo');
      });
    });

  document.querySelectorAll('.edit-aplicativo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-aplicativo');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-aplicativo-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_aplicativo';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="descricao"]').value =
        btn.getAttribute('data-descricao') || '';
      const aVal = form.querySelector('[name="valor_renovacao"]');
      if (aVal) aVal.value = btn.getAttribute('data-valor') || '';
      const aStatus = form.querySelector('[name="status"]');
      if (aStatus) aStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const aTit = modal.querySelector('.modal-header h3');
      if (aTit) setIconLabel(aTit, 'edit', 'Editar Aplicativo');
      setModalState(modal, true);
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-aplicativo"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-aplicativo-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_aplicativo';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const t = document.querySelector(
          '#modal-add-aplicativo .modal-header h3',
        );
        if (t) setIconLabel(t, 'plus', 'Novo Aplicativo');
      });
    });

  document.querySelectorAll('.edit-servidor').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-servidor');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-servidor-form');
      if (!form) return;
      // Preenche so os campos que ainda existem no form (nome, identificador,
      // creditos, valor, obs). Campos legados foram removidos da UI mas o
      // schema continua com as colunas — backend grava NULL/0 por default.
      form.querySelector('[name="action"]').value = 'update_servidor';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="creditos"]').value =
        btn.getAttribute('data-creditos') || '0';
      form.querySelector('[name="valor_cred"]').value =
        btn.getAttribute('data-valor') || '0';
      const setIfExists = (name, val) => {
        const el = form.querySelector('[name="' + name + '"]');
        if (el) el.value = val || '';
      };
      setIfExists('identificador', btn.getAttribute('data-identificador'));
      setIfExists('observacao_servidor', btn.getAttribute('data-obs'));
      const stitulo = modal.querySelector('.modal-header h3');
      if (stitulo) setIconLabel(stitulo, 'edit', 'Editar Servidor');
      const sBtnEd = document.querySelector(
        'button[type="submit"][form="modal-add-servidor-form"]',
      );
      if (sBtnEd) sBtnEd.textContent = 'Salvar';
      setModalState(modal, true);
      if (btn.hasAttribute('data-credit-focus')) {
        if (stitulo) setIconLabel(stitulo, 'money', 'Ajustar saldo');
        const creditos = form.querySelector('[name="creditos"]');
        creditos.focus({ preventScroll: true });
        creditos.select();
      }
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-servidor"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-servidor-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_servidor';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const t = document.querySelector(
          '#modal-add-servidor .modal-header h3',
        );
        if (t) setIconLabel(t, 'plus', 'Novo Servidor');
        const sBtnNv = document.querySelector(
          'button[type="submit"][form="modal-add-servidor-form"]',
        );
        if (sBtnNv) sBtnNv.textContent = 'Cadastrar';
      });
    });

  document.querySelectorAll('form.delete-servidor').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar este servidor?')) {
        e.preventDefault();
      }
    });
  });

  // Sync no modal de renovacao:
  // O plano conta em meses de calendario? Aceita 'Mes', 'Mês' e 'Meses' — o form
  // de planos grava 'Meses' mas o default do banco e 'Mês'.
  const periodoEmMeses = (tipo) =>
    /^mes/.test(
      String(tipo || '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .trim(),
    );

  // base + (periodo × vezes) em dias OU meses de calendario.
  // ESPELHA core/format.py::somar_periodo — os dois tem que concordar, senao o
  // modal sugere uma data e a renovacao automatica por PIX grava outra.
  // Em meses o dia e preso ao ultimo dia valido: 31/01 + 1 mes = 28/02.
  const somarPeriodo = (base, periodo, tipo, vezes) => {
    const n = Number(periodo) * Number(vezes || 1);
    if (!periodoEmMeses(tipo)) {
      return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
    }
    const total = base.getMonth() + n;
    const ano = base.getFullYear() + Math.floor(total / 12);
    const mes = ((total % 12) + 12) % 12;
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    return new Date(ano, mes, Math.min(base.getDate(), ultimoDia));
  };

  // - O input "Creditos" eh o driver. Se nao tiver (form de cadastro), cai pra telas.
  // - Custo = creditos × valorCred do servidor.
  // - Valor = creditos × valor do plano (so no modal de renovacao, ver valorBase).
  // - Vencimento = data-base + creditos × periodo do plano (so no modal de renovacao,
  //   identificado por form.dataset.baseVencIso + form.dataset.periodoQtd).
  const syncClienteUsageFields = (form) => {
    if (!form) return;
    const creditosInput = form.querySelector(
      '[data-creditos-input], [name="creditos_gastos"]',
    );
    const telasInput = form.querySelector('[data-telas-input], [name="telas"]');
    const servidorSelect = form.querySelector('[name="servidor"]');
    const custoInput = form.querySelector('[name="custo_pagamento"]');
    const valorInput = form.querySelector('[name="valor"]');

    // creditos = numero de PERIODOS renovados (o campo "Creditos" do modal). Cada
    // periodo estende o vencimento e multiplica valor/custo. NAO confundir com o
    // consumo do servidor, que e telas × periodos (ver custo abaixo).
    const creditos = Math.max(1, Number(creditosInput?.value || 0) || 1);
    // telas do cliente na renovacao (campo oculto, fixo) — no cadastro/edicao esse
    // querySelector pega o campo visivel, mas la nao ha custoInput, entao so afeta
    // o custo dentro do modal de renovacao.
    const telasRenov = Math.max(1, Number(telasInput?.value) || 1);

    const selected = servidorSelect?.selectedOptions?.[0];
    const valorCred = Number(
      selected?.getAttribute('data-valor-cred') ?? form.dataset.valorCred ?? 0,
    );
    // Custo = valorCred × telas × periodos. As telas entram porque cada tela e uma
    // linha no servidor: 2 telas renovando 3 meses consomem 6 creditos (R$ 6×valorCred).
    const creditosPlano = Number(form.dataset.creditosPlano) || 1;
    if (custoInput)
      custoInput.value = (
        valorCred *
        telasRenov *
        creditos *
        creditosPlano
      ).toFixed(2);
    const resumoPeriodo = form.querySelector('[data-renovacao-periodo]');
    if (resumoPeriodo) {
      const duracao = Number(form.dataset.periodoQtd) * creditos;
      const unidade = periodoEmMeses(form.dataset.periodoTipo)
        ? duracao === 1
          ? 'mês'
          : 'meses'
        : duracao === 1
          ? 'dia'
          : 'dias';
      resumoPeriodo.textContent =
        'Renova por ' +
        duracao +
        ' ' +
        unidade +
        '. Consumo: ' +
        (telasRenov * creditos * creditosPlano).toLocaleString('pt-BR') +
        ' créditos do servidor.';
    }

    // Valor cobrado = valor do plano × creditos. Cada credito e um periodo inteiro
    // do plano (ja estende o vencimento e ja multiplica o custo), entao renovar 2
    // creditos de um plano de R$ 25 tem que cobrar R$ 50 — nao R$ 25.
    // So no modal de renovacao: valorBase so existe la (no cadastro o usuario digita
    // o valor na mao e nao pode ser sobrescrito).
    const valorBase = Number(form.dataset.valorBase);
    if (
      valorInput &&
      form.dataset.valorBase !== undefined &&
      Number.isFinite(valorBase)
    ) {
      valorInput.value = (valorBase * creditos).toFixed(2);
    }
    // Valor escalonado por telas (SO no cadastro/edicao, onde "Telas" e visivel):
    // dobrar as telas dobra o valor. Base = "valor por tela" (dataset.valorPorTela),
    // semeado ao abrir a edicao (valorAtual/telasAtuais) e reajustado quando o
    // usuario digita o valor na mao (ver o listener de 'valor' em bindClienteUsageFields).
    // No else pra nunca colidir com o valorBase da renovacao acima.
    else if (
      valorInput &&
      telasInput &&
      telasInput.type !== 'hidden' &&
      form.dataset.valorPorTela !== undefined
    ) {
      const porTela = Number(form.dataset.valorPorTela);
      const raw = String(telasInput.value).trim();
      const telasN = Number(raw);
      // So recalcula com telas valida (>=1). Campo vazio/0 durante a digitacao NAO
      // zera o valor — deixa o usuario terminar de digitar sem perder o preco.
      if (
        Number.isFinite(porTela) &&
        porTela > 0 &&
        raw !== '' &&
        Number.isFinite(telasN) &&
        telasN >= 1
      ) {
        valorInput.value = (porTela * telasN).toFixed(2);
      }
    }

    // Recalcula vencimento: base + creditos × periodo (so no modal de renovacao)
    const baseIso = form.dataset.baseVencIso;
    const periodoQtd = Number(form.dataset.periodoQtd || 0);
    const vencInput = form.querySelector('[name="vencimento"]');
    if (baseIso && periodoQtd > 0 && vencInput) {
      const parts = baseIso.split('-');
      const base = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2]),
      );
      const novo = somarPeriodo(
        base,
        periodoQtd,
        form.dataset.periodoTipo,
        creditos,
      );
      const dd = String(novo.getDate()).padStart(2, '0');
      const mm = String(novo.getMonth() + 1).padStart(2, '0');
      setDateInputValue(vencInput, novo.getFullYear() + '-' + mm + '-' + dd);
    }
  };

  const bindClienteUsageFields = (form) => {
    if (!form) return;
    ['plano', 'servidor', 'telas', 'creditos_gastos'].forEach((name) => {
      const field = form.querySelector('[name="' + name + '"]');
      if (field) {
        field.addEventListener('input', () => syncClienteUsageFields(form));
        field.addEventListener('change', () => syncClienteUsageFields(form));
      }
    });
    // No cadastro/edicao, digitar o valor na mao REDEFINE o "valor por tela" — assim
    // um desconto/ajuste manual vira a nova base, e mudar as telas depois escala a
    // partir dele. Nao chama o sync (senao sobrescreveria o que esta sendo digitado)
    // e nao roda na renovacao (la o valor e ditado pelos creditos, valorBase).
    const valorField = form.querySelector('[name="valor"]');
    if (valorField) {
      valorField.addEventListener('input', () => {
        if (form.dataset.valorBase !== undefined) {
          const periodos = Math.max(
            1,
            Number(form.querySelector('[name="creditos_gastos"]')?.value) || 1,
          );
          form.dataset.valorBase = String(Number(valorField.value) / periodos);
          return;
        }
        const telasN = Math.max(
          1,
          Number(form.querySelector('[name="telas"]')?.value) || 1,
        );
        const v = Number(valorField.value);
        if (Number.isFinite(v) && v > 0)
          form.dataset.valorPorTela = String(v / telasN);
      });
    }
    syncClienteUsageFields(form);
  };

  bindClienteUsageFields(document.getElementById('modal-add-cliente-form'));
  bindClienteUsageFields(document.getElementById('modal-add-pagamento-form'));
  const renovacaoPlano = document.querySelector('[data-renovacao-plano]');
  if (renovacaoPlano)
    renovacaoPlano.addEventListener('change', () => {
      const form = renovacaoPlano.form;
      const option = renovacaoPlano.selectedOptions[0];
      form.dataset.periodoQtd = option?.dataset.periodo || '30';
      form.dataset.periodoTipo = option?.dataset.tipoPeriodo || 'Dias';
      form.dataset.creditosPlano = option?.dataset.creditosPlano || '1';
      syncClienteUsageFields(form);
    });

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

  // ----- Transações -----
  document
    .querySelectorAll('[data-open-modal="modal-nova-transacao"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-nova-transacao-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_transacao';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const titulo = document.querySelector(
          '#modal-nova-transacao .modal-header h3',
        );
        if (titulo) titulo.textContent = '+ Nova Transação';
      });
    });

  document.querySelectorAll('.edit-transacao').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-nova-transacao');
      const form = modal && modal.querySelector('#modal-nova-transacao-form');
      if (!form) return;
      const set = (name, val) => {
        const el = form.querySelector('[name="' + name + '"]');
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
      const titulo = modal.querySelector('.modal-header h3');
      if (titulo) setIconLabel(titulo, 'edit', 'Editar Transação');
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('.view-transacao').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-transacao-info');
      if (!modal) return;
      const put = (id, attr) => {
        const el = document.getElementById(id);
        if (el) el.textContent = btn.getAttribute(attr) || '—';
      };
      put('tx-info-data', 'data-data');
      put('tx-info-cliente', 'data-cliente');
      put('tx-info-pagamento', 'data-pagamento');
      put('tx-info-descricao', 'data-descricao');
      put('tx-info-servidor', 'data-servidor');
      put('tx-info-plano', 'data-plano');
      put('tx-info-telas', 'data-telas');
      put('tx-info-creditos', 'data-creditos');
      put('tx-info-custo', 'data-custo');
      put('tx-info-total', 'data-total');
      put('tx-info-lucro', 'data-lucro');
      // Aplica cor + sinal correto no Lucro (inline style — independente de CSS file)
      const lucroEl = document.getElementById('tx-info-lucro');
      if (lucroEl) {
        const neg = btn.getAttribute('data-lucro-neg') === '1';
        const raw = btn.getAttribute('data-lucro') || '—';
        lucroEl.textContent = neg || raw.startsWith('-') ? raw : '+' + raw;
        lucroEl.style.color = neg ? '#ef4444' : '#22c55e';
      }
      const totalEl = document.getElementById('tx-info-total');
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
  document.querySelectorAll('tr.tx-row').forEach((row) => {
    const open = () => {
      const btn = row.querySelector('.view-transacao');
      if (btn) btn.click();
    };
    row.addEventListener('click', (e) => {
      if (e.target.closest('button, a, input, form, select, label')) return;
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
  });

  const txClienteSelect = document.querySelector('[data-tx-cliente]');
  if (txClienteSelect) {
    txClienteSelect.addEventListener('change', () => {
      const opt = txClienteSelect.selectedOptions[0];
      if (!opt || !opt.value) return;
      const form = txClienteSelect.closest('form');
      if (!form) return;
      const fill = (name, val) => {
        const el = form.querySelector('[name="' + name + '"]');
        if (el && !el.value) el.value = val;
      };
      fill('plano', opt.getAttribute('data-plano') || '');
      fill('servidor', opt.getAttribute('data-servidor') || '');
      const telas = form.querySelector('[name="telas"]');
      if (telas) telas.value = opt.getAttribute('data-telas') || '1';
      fill('valor_venda', opt.getAttribute('data-valor') || '');
    });
  }

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

  document.querySelectorAll('.open-whatsapp-message').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-send-whatsapp');
      if (!modal) return;
      const form = modal.querySelector('#modal-send-whatsapp-form');
      if (!form) return;
      form.reset();
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      const nome = btn.getAttribute('data-nome') || '';
      const tel = btn.getAttribute('data-telefone') || '';
      const nomeEl = modal.querySelector('[data-wa-nome]');
      if (nomeEl) nomeEl.textContent = nome || '—';
      const telEl = modal.querySelector('[data-wa-telefone]');
      if (telEl) telEl.textContent = tel;
      // reseta a mídia
      const mt = form.querySelector('[name="media_tipo"]');
      if (mt) mt.value = '';
      const murl = form.querySelector('.wa-media-url');
      if (murl) {
        murl.hidden = true;
        murl.value = '';
      }
      form
        .querySelectorAll('[data-wa-media]')
        .forEach((b) => b.classList.remove('active'));
      setModalState(modal, true);
    });
  });

  // Template (opcional) -> preenche o textarea da mensagem
  const waTemplate = document.querySelector(
    '#modal-send-whatsapp-form [data-wa-template]',
  );
  const waMensagem = document.querySelector(
    '#modal-send-whatsapp-form [data-wa-mensagem]',
  );
  if (waTemplate && waMensagem) {
    waTemplate.addEventListener('change', () => {
      const opt = waTemplate.options[waTemplate.selectedIndex];
      const msg = opt ? opt.getAttribute('data-message') || '' : '';
      if (msg) waMensagem.value = msg;
    });
  }

  // Botões de Anexar Mídia: define o tipo e mostra o campo de link
  const waForm = document.getElementById('modal-send-whatsapp-form');
  if (waForm) {
    const urlInput = waForm.querySelector('.wa-media-url');
    const tipoInput = waForm.querySelector('[name="media_tipo"]');
    waForm.querySelectorAll('[data-wa-media]').forEach((b) => {
      b.addEventListener('click', () => {
        const ativo = b.classList.contains('active');
        waForm
          .querySelectorAll('[data-wa-media]')
          .forEach((x) => x.classList.remove('active'));
        if (ativo) {
          if (tipoInput) tipoInput.value = '';
          if (urlInput) {
            urlInput.hidden = true;
          }
        } else {
          b.classList.add('active');
          if (tipoInput)
            tipoInput.value = b.getAttribute('data-wa-media') || '';
          if (urlInput) {
            urlInput.hidden = false;
            urlInput.focus();
          }
        }
      });
    });
  }

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

  window.addEventListener('focus', () => {
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

  document.querySelectorAll('form.delete-plano').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar este plano?')) {
        e.preventDefault();
      }
    });
  });

  document.querySelectorAll('.edit-mensagem').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-mensagem');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-mensagem-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_mensagem';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="titulo"]').value =
        btn.getAttribute('data-titulo') || '';
      const desc = form.querySelector('[name="descricao"]');
      if (desc) desc.value = btn.getAttribute('data-descricao') || '';
      form.querySelector('[name="mensagem"]').value =
        btn.getAttribute('data-mensagem') || '';
      form.querySelector('[name="media_tipo"]').value =
        btn.getAttribute('data-media-tipo') || '';
      form.querySelector('[name="media_path"]').value =
        btn.getAttribute('data-media-path') || '';
      const title = modal.querySelector('.modal-header h3');
      if (title) setIconLabel(title, 'edit', 'Editar Template');
      setModalState(modal, true);
    });
  });

  document.querySelectorAll('form.delete-mensagem').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar esta mensagem?')) {
        e.preventDefault();
      }
    });
  });

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

  const msgNotice = document.getElementById('modal-mensagem-notice');
  if (msgNotice) {
    const msg = document.getElementById('modal-mensagem-notice-msg');
    const params = new URLSearchParams(window.location.search);
    let text = '';
    if (params.get('saved') === '1') text = 'Mensagem salva com sucesso.';
    if (params.get('updated') === '1')
      text = 'Mensagem atualizada com sucesso.';
    if (params.get('deleted') === '1') text = 'Mensagem apagada com sucesso.';
    if (text) {
      if (msg) msg.textContent = text;
      setModalState(msgNotice, true);
      params.delete('saved');
      params.delete('updated');
      params.delete('deleted');
      const newUrl =
        window.location.pathname +
        (params.toString() ? '?' + params.toString() : '');
      window.history.replaceState({}, '', newUrl);
    }
  }

  const tagSelect = document.querySelector('[data-insert-tag]');
  const msgTextarea = document.querySelector('[data-mensagem-text]');
  if (tagSelect && msgTextarea) {
    tagSelect.addEventListener('change', () => {
      const tag = tagSelect.value;
      if (!tag) return;
      const start = msgTextarea.selectionStart || 0;
      const end = msgTextarea.selectionEnd || 0;
      const text = msgTextarea.value;
      msgTextarea.value = text.slice(0, start) + tag + text.slice(end);
      const pos = start + tag.length;
      msgTextarea.setSelectionRange(pos, pos);
      msgTextarea.focus();
      tagSelect.value = '';
    });
  }

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

  // Input masks for older fields that do not use the shared date component.
  const dateInputs = document.querySelectorAll(
    'input[name="vencimento"]:not([data-date-mask]), input[name="data_pagamento"]:not([data-date-mask])',
  );
  dateInputs.forEach((input) => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 8);
      if (v.length >= 5) {
        v = v.replace(/(\d{2})(\d{2})(\d{0,4})/, '$1/$2/$3');
      } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{0,2})/, '$1/$2');
      }
      e.target.value = v;
    });
  });

  const phoneInputs = document.querySelectorAll('input[name="telefone"]');
  phoneInputs.forEach((input) => {
    input.addEventListener('input', (e) => {
      let v = e.target.value.replace(/\D/g, '').slice(0, 11);
      if (v.length >= 7) {
        v = v.replace(/(\d{2})(\d{4,5})(\d{0,4})/, '($1) $2-$3');
      } else if (v.length >= 3) {
        v = v.replace(/(\d{2})(\d{0,5})/, '($1) $2');
      } else if (v.length >= 1) {
        v = v.replace(/(\d{0,2})/, '($1');
      }
      e.target.value = v.trim();
    });
  });

  const servidorSelect = document.querySelector('[data-valor-cred-select]');
  if (servidorSelect) {
    servidorSelect.addEventListener('change', () => {
      const selected = servidorSelect.options[servidorSelect.selectedIndex];
      const valorCred = selected
        ? selected.getAttribute('data-valor-cred')
        : '';
      const telasInput = document.querySelector('input[name="telas"]');
      const custoTotalInput = document.querySelector('[data-custo-total]');
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

  function showToast(message, type) {
    const container = document.querySelector('.container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className =
      'toast ' + (type === 'success' ? 'toast-success' : 'toast-error');
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    container.prepend(toast);
    setTimeout(() => {
      toast.remove();
    }, 4000);
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
          );
          if (!card) return;
          const isOn = (item.status || '').toLowerCase() === 'conectado';
          const cover = card.querySelector('.wa-cover');
          const badge = card.querySelector('[data-wa-status-badge]');
          const phoneRow = card.querySelector('[data-wa-phone-row]');
          const phoneEl = card.querySelector('[data-wa-phone]');

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
