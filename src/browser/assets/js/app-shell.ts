import {
  advanceWhatsappIndicator,
  type WhatsappIndicator,
} from '../../../frontend/whatsappIndicator.js';
import { initReleaseNotice } from './ui/release-notice.js';
import { initSessionActivity } from './ui/session-activity.js';
import { initSchedulerStatus } from './ui/scheduler-status.js';
import {
  confirmElementAction,
  confirmPanelAction,
  showPanelNotice,
} from './ui/panel-feedback.js';

const showError = (text: string) => showPanelNotice(text, true);

// Mantém as consultas do cabeçalho durante a navegação do mesmo documento.
// A troca de tela não deve reiniciar requisições nem duplicar uma em andamento.
const shellReads = new Map<
  string,
  { at: number; value?: any; pending?: Promise<any> }
>();
const whatsappSnapshots = new Map<
  string,
  { indicator: WhatsappIndicator; response: any }
>();
let initializedShell: HTMLElement | null = null;
let initializedScope: string | undefined;
function readShellStatus(key: string, url: string, interval: number) {
  const state = shellReads.get(key) || { at: 0 };
  if (state.pending) return state.pending;
  if (state.value && Date.now() - state.at < interval)
    return Promise.resolve(state.value);
  shellReads.set(key, state);
  state.pending = fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20000),
  })
    .then((response) => {
      window.gestorPolling?.recordResponse(response);
      if (!response.ok || response.redirected)
        throw new Error('Consulta indisponível');
      return response.json();
    })
    .then((value) => {
      state.at = Date.now();
      state.value = value;
      return value;
    })
    .finally(() => {
      state.pending = undefined;
    });
  return state.pending;
}

window.__gestorInitShell = function () {
  const shell = document.querySelector<HTMLElement>('[data-shell]');
  const queryScope =
    shell?.dataset.releaseLogin ||
    document.querySelector<HTMLElement>('[data-wa-chip]')?.dataset.waStateKey ||
    'panel';
  const persistent = shell?.hasAttribute('data-persistent-panel');
  if (
    persistent &&
    shell === initializedShell &&
    queryScope === initializedScope &&
    window.__gestorShellAbort &&
    !window.__gestorShellAbort.signal.aborted
  )
    return;
  window.__gestorShellAbort?.abort();
  const lifecycle = new AbortController();
  window.__gestorShellAbort = lifecycle;
  initializedShell = shell;
  initializedScope = queryScope;
  const timeouts = new Set<number>();
  const intervals = new Set<number>();
  const on = (
    target: EventTarget,
    type: string,
    handler: (event: any) => void,
    options: AddEventListenerOptions | boolean = {},
  ) =>
    target.addEventListener(type, handler, {
      ...(typeof options === 'boolean' ? { capture: options } : options),
      signal: lifecycle.signal,
    });
  on(document, 'change', (event) => {
    if (event.target?.matches('[data-submit-on-change]'))
      event.target.form?.requestSubmit();
  });
  const confirmAction = (event) => {
    if (event.gestorConfirmationHandled) return;
    const element =
      event.type === 'submit'
        ? event.target
        : event.target?.closest('[data-confirm]');
    if (
      !element?.dataset.confirm ||
      (event.type === 'click' && element instanceof HTMLFormElement)
    )
      return;
    event.gestorConfirmationHandled = true;
    confirmElementAction(event, element, element.dataset.confirm);
  };
  on(document, 'click', confirmAction, { capture: true });
  on(document, 'submit', confirmAction, { capture: true });
  document
    .querySelectorAll<HTMLElement>('[data-auto-panel-notice]')
    .forEach((notice) => {
      const text = notice.querySelector('p')?.textContent || '';
      const error = notice.dataset.state === 'error';
      notice.remove();
      if (text) showPanelNotice(text, error);
    });
  const setTimeout = (callback: () => void, delay: number) => {
    if (lifecycle.signal.aborted) return;
    const timer = window.setTimeout(() => {
      timeouts.delete(timer);
      if (!lifecycle.signal.aborted) callback();
    }, delay);
    timeouts.add(timer);
    return timer;
  };
  const setInterval = (callback: () => void, delay: number) => {
    const timer = window.setInterval(callback, delay);
    intervals.add(timer);
    return timer;
  };
  lifecycle.signal.addEventListener(
    'abort',
    () => {
      timeouts.forEach((timer) => window.clearTimeout(timer));
      intervals.forEach((timer) => window.clearInterval(timer));
    },
    { once: true },
  );
  if (!persistent) on(document, 'gestor:before-swap', () => lifecycle.abort());
  // Obs.: a troca de tema (claro/escuro) é feita pelo main.js via [data-theme-toggle].
  void initReleaseNotice(shell, lifecycle.signal);
  initSessionActivity(shell, lifecycle.signal);

  // Um bloqueio de tráfego pausa todas as consultas automáticas da aba.
  window.gestorPolling =
    window.gestorPolling ||
    (function () {
      var blockedUntil = 0,
        failures = 0;
      var storageKey = 'gestor-polling-backoff';
      function restoreBlock() {
        try {
          var saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
          if (
            saved &&
            Number.isFinite(saved.until) &&
            saved.until > blockedUntil &&
            saved.until > Date.now()
          ) {
            blockedUntil = saved.until;
            failures = Math.min(Math.max(Number(saved.failures) || 1, 1), 4);
          }
        } catch (e) {
          /* armazenamento indisponível: mantém a pausa nesta aba */
        }
      }
      return {
        canFetch: function () {
          restoreBlock();
          return !document.hidden && Date.now() >= blockedUntil;
        },
        recordResponse: function (response) {
          restoreBlock();
          var now = Date.now();
          if (response.status === 429) {
            failures = Math.min(failures + 1, 4);
            var retryAfter = response.headers.get('Retry-After') || '';
            var requested = /^\d+$/.test(retryAfter)
              ? Number(retryAfter) * 1000
              : Date.parse(retryAfter) - now;
            var delay = Math.min(60000 * Math.pow(2, failures - 1), 300000);
            if (Number.isFinite(requested)) delay = Math.max(delay, requested);
            blockedUntil = Math.max(blockedUntil, now + delay);
            try {
              localStorage.setItem(
                storageKey,
                JSON.stringify({ until: blockedUntil, failures: failures }),
              );
            } catch (e) {
              /* armazenamento indisponível: mantém a pausa nesta aba */
            }
          } else if (response.ok && now >= blockedUntil) {
            failures = 0;
          }
        },
      };
    })();

  // ----- CSRF helper -----
  // O token vem como meta tag no <head>. Toda chamada AJAX POST/PUT/DELETE
  // precisa enviar como `x-csrf-token`, senão o middleware csrfMiddleware
  // rejeita com 403. Expomos window.csrfFetch(url, opts) como wrapper
  // automático — apenas use em vez de fetch direto.
  window.getCsrfToken = function () {
    var m = document.querySelector('meta[name="csrf-token"]') as HTMLElement;
    return m ? m.getAttribute('content') || '' : '';
  };
  window.csrfFetch = function (url, opts) {
    opts = opts || {};
    var method = (opts.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
      opts.headers = Object.assign({}, opts.headers || {}, {
        'x-csrf-token': window.getCsrfToken(),
      });
    }
    return fetch(url, opts);
  };

  // Descarta a preferencia antiga de menu compacto.
  try {
    localStorage.removeItem('gestor-sidebar');
  } catch (e) {}

  // Menu lateral no mobile (overlay)
  var menuButtons = document.querySelectorAll(
    '[data-sidebar-mobile]',
  ) as NodeListOf<HTMLElement>;
  var backdrop = document.querySelector(
    '[data-sidebar-backdrop]',
  ) as HTMLElement;
  function setMobileMenu(open) {
    if (shell) shell.classList.toggle('sidebar-open', open);
    menuButtons.forEach(function (button) {
      button.setAttribute('aria-expanded', String(open));
    });
  }
  function closeMobile() {
    setMobileMenu(false);
  }
  menuButtons.forEach(function (button) {
    on(button, 'click', function () {
      if (shell) setMobileMenu(!shell.classList.contains('sidebar-open'));
    });
  });
  if (backdrop) on(backdrop, 'click', closeMobile);
  on(document, 'keydown', function (event) {
    if (event.key === 'Escape') closeMobile();
  });
  function updateDock(event?: Event & { detail?: { url?: string } }) {
    closeMobile();
    var path = event?.detail?.url
      ? new URL(event.detail.url, location.href).pathname
      : location.pathname;
    (
      document.querySelectorAll(
        '[data-dock-link]',
      ) as NodeListOf<HTMLAnchorElement>
    ).forEach(function (link) {
      var active =
        path === link.pathname || path.startsWith(link.pathname + '/');
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  updateDock();
  on(document, 'gestor:navigated', updateDock);
  on(document, 'gestor:navigation-start', updateDock);
  on(document, 'gestor:navigation-finished', updateDock);

  var accountWrap = document.querySelector(
    '[data-account-menu-wrap]',
  ) as HTMLElement;
  var accountToggle = document.querySelector(
    '[data-account-menu-toggle]',
  ) as HTMLElement;
  var accountMenu = document.querySelector(
    '[data-account-menu]',
  ) as HTMLElement;
  function closeAccountMenu() {
    if (!accountMenu || !accountToggle) return;
    accountMenu.hidden = true;
    accountToggle.setAttribute('aria-expanded', 'false');
  }
  on(document, 'gestor:before-swap', closeAccountMenu);
  if (accountToggle && accountMenu) {
    on(accountToggle, 'click', function () {
      var open = accountMenu.hidden;
      accountMenu.hidden = !open;
      accountToggle.setAttribute('aria-expanded', String(open));
    });
    on(document, 'click', function (event) {
      if (
        !accountWrap.contains(event.target as HTMLElement) ||
        ((event.target as HTMLElement).closest(
          '[data-account-menu] a',
        ) as HTMLElement)
      )
        closeAccountMenu();
    });
    on(document, 'keydown', function (event) {
      if (event.key === 'Escape' && !accountMenu.hidden) {
        closeAccountMenu();
        accountToggle.focus();
      }
    });
    on(document, 'focusin', function (event) {
      if (!accountWrap.contains(event.target as HTMLElement))
        closeAccountMenu();
    });
  }

  // Fechar banner do topo
  on(document, 'click', function (event) {
    const bannerClose = (event.target as HTMLElement).closest(
      '[data-dismiss-banner]',
    );
    if (bannerClose) {
      var banner = bannerClose.closest('.dash-banner') as HTMLElement;
      if (banner) banner.remove();
    }
  });

  // Atalho Ctrl+K para a busca
  on(document, 'keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      const search = document.querySelector<HTMLElement>(
        '[data-global-search]',
      );
      e.preventDefault();
      if (search) search.focus();
    }
  });

  // Status do WhatsApp no topo — pinta a bolinha (verde/vermelha) e popula o
  // tooltip com o número conectado. Atualiza a cada 30s pra refletir
  // reconexões/desconexões. Sem texto "on/off" exibido — só a bolinha.
  var waChip = document.querySelector('[data-wa-chip]') as HTMLElement;
  const waQueryKey = queryScope + ':whatsapp';
  let waState: WhatsappIndicator = whatsappSnapshots.get(waQueryKey)
    ?.indicator || { disconnectedChecks: 0 };
  try {
    const cached = JSON.parse(
      sessionStorage.getItem(waChip?.dataset.waStateKey) || 'null',
    );
    if (
      cached?.connected === true &&
      Number.isFinite(cached.at) &&
      Date.now() - cached.at >= 0 &&
      Date.now() - cached.at < 120000
    ) {
      waState = {
        connected: true,
        disconnectedChecks: 0,
        deviceId: cached.deviceId,
      };
      waChip.classList.add('is-on');
      waChip.classList.remove('is-off');
      waChip.title = 'WhatsApp conectado';
      waChip.setAttribute('aria-label', waChip.title);
    }
  } catch {}
  function formatarNumeroWa(num) {
    var d = String(num || '').replace(/\D+/g, '');
    if (!d) return '';
    if (d.indexOf('55') === 0 && (d.length === 13 || d.length === 12)) {
      var ddd = d.substr(2, 2);
      var resto = d.substr(4);
      if (resto.length === 9)
        return (
          '+55 (' + ddd + ') ' + resto.substr(0, 5) + '-' + resto.substr(5)
        );
      if (resto.length === 8)
        return (
          '+55 (' + ddd + ') ' + resto.substr(0, 4) + '-' + resto.substr(4)
        );
    }
    return '+' + d;
  }
  // No mobile o /whatsapp/status pode demorar pra primeira resposta e a UI
  // mostrava "desconectado" enganosamente. Regras:
  //  - Falha de rede NAO vira "is-off" (mantem estado anterior).
  //  - Retry rapido no boot (2 tentativas com 1s de gap) pra cobrir cold start.
  //  - Poll a cada 30s, pausado quando a aba está oculta ou recebe 429.
  //  - Refetch imediato em visibilitychange/focus/pageshow — cobre o caso
  //    do user voltar pra aba/app depois de ficar em outro app.
  var waFetchInflight = false;
  function atualizarWaChip(refresh: boolean | Event = false) {
    if (!waChip || waFetchInflight || !window.gestorPolling.canFetch())
      return Promise.resolve();
    waFetchInflight = true;
    return readShellStatus(
      waQueryKey,
      '/whatsapp/status',
      refresh ? 1000 : 30000,
    )
      .then(function (s) {
        if (lifecycle.signal.aborted) return;
        if (!s) {
          waState = { ...waState, disconnectedChecks: 0 };
          return;
        }
        // Erros e respostas incompletas não confirmam uma desconexão.
        const snapshot = whatsappSnapshots.get(waQueryKey);
        waState =
          snapshot?.response === s
            ? snapshot.indicator
            : advanceWhatsappIndicator(snapshot?.indicator || waState, s);
        whatsappSnapshots.set(waQueryKey, { indicator: waState, response: s });
        if (waState.disconnectedChecks === 1)
          setTimeout(() => atualizarWaChip(true), 1500);
        const connected = waState.connected;
        if (connected === undefined) {
          waChip.classList.remove('is-on', 'is-off');
          waChip.title = 'Verificando a conexão do WhatsApp';
          waChip.setAttribute('aria-label', waChip.title);
          return;
        }
        waChip.classList.toggle('is-on', connected);
        waChip.classList.toggle('is-off', !connected);
        if (
          s.connected === true ||
          s.status === 'conectado' ||
          waState.disconnectedChecks >= 2
        )
          try {
            sessionStorage.setItem(
              waChip.dataset.waStateKey,
              JSON.stringify({
                connected: connected,
                at: Date.now(),
                deviceId: waState.deviceId,
              }),
            );
          } catch (e) {}
        if (connected && s.number) {
          var fmt = formatarNumeroWa(s.number);
          waChip.title =
            'WhatsApp conectado: ' +
            fmt +
            (s.pushName ? ' · ' + s.pushName : '');
          waChip.setAttribute('aria-label', 'WhatsApp conectado em ' + fmt);
        } else if (connected) {
          waChip.title = 'WhatsApp conectado';
        } else {
          waChip.title = 'WhatsApp desconectado — clique pra conectar';
        }
        waChip.setAttribute('aria-label', waChip.title);
      })
      .catch(function () {
        if (lifecycle.signal.aborted) return;
        waState = { ...waState, disconnectedChecks: 0 };
        /* rede off — nao mexe no estado, evita falso "desconectado" */
      })
      .then(function () {
        waFetchInflight = false;
      });
  }
  // Boot: fetch imediato + 1 retry apos 1.5s (cobre cold start no mobile).
  atualizarWaChip().then(function () {
    if (
      waChip &&
      !waChip.classList.contains('is-on') &&
      !waChip.classList.contains('is-off')
    ) {
      setTimeout(() => atualizarWaChip(true), 1500);
    }
  });
  // Consultas periódicas sem novas tentativas durante o bloqueio.
  if (waChip) {
    function waSchedule() {
      setTimeout(function () {
        atualizarWaChip(true).finally(waSchedule);
      }, 30000);
    }
    waSchedule();
    // Refetch quando o user volta pra aba (mobile: troca de app).
    on(document, 'visibilitychange', function () {
      if (document.visibilityState === 'visible') atualizarWaChip(true);
    });
    on(window, 'focus', atualizarWaChip);
    on(window, 'pageshow', atualizarWaChip);
  }

  initSchedulerStatus(shell, lifecycle.signal);

  // Copiar ID do cliente (botão ⧉ na tabela)
  on(document, 'click', function (e) {
    var btn = (e.target as HTMLElement).closest('[data-copy]') as HTMLElement;
    if (!btn) return;
    e.preventDefault();
    var val = btn.getAttribute('data-copy') || '';
    if (navigator.clipboard)
      navigator.clipboard.writeText(val).catch(function () {});
    var old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(function () {
      btn.textContent = old;
    }, 1000);
  });

  // Selecionar todos os clientes (checkbox do cabeçalho)
  on(document, 'change', function (event) {
    const master = event.target as HTMLInputElement;
    if (!master.matches('[data-check-all]')) return;
    if (master.closest('[data-react-page]') as HTMLElement) return;
    var scope = (master.closest('table') as HTMLElement) || document;
    (
      scope.querySelectorAll('tbody .cli-check') as NodeListOf<HTMLInputElement>
    ).forEach(function (cb) {
      cb.checked = master.checked;
    });
  });

  // Menu de ações (3 pontos) nas linhas da tabela de clientes
  (function () {
    function closeAllMenus() {
      (
        document.querySelectorAll(
          '.cli-menu-pop.open',
        ) as NodeListOf<HTMLElement>
      ).forEach(function (p) {
        p.classList.remove('open');
        p.hidden = true;
        var b =
          p.parentElement &&
          (p.parentElement.querySelector('.cli-menu-btn') as HTMLElement);
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
    on(document, 'click', function (e) {
      var trigger = (e.target as HTMLElement).closest(
        '.cli-menu-btn',
      ) as HTMLElement;
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        var pop = trigger.parentElement.querySelector(
          '.cli-menu-pop',
        ) as HTMLElement;
        if (!pop) return;
        var willOpen = pop.hidden;
        closeAllMenus();
        if (willOpen) {
          pop.hidden = false;
          pop.classList.add('open');
          trigger.setAttribute('aria-expanded', 'true');
          var r = trigger.getBoundingClientRect();
          pop.style.position = 'fixed';
          pop.style.top = r.bottom + 6 + 'px';
          var left = r.right - pop.offsetWidth;
          var maxLeft = window.innerWidth - pop.offsetWidth - 8;
          if (left > maxLeft) left = maxLeft;
          if (left < 8) left = 8;
          pop.style.left = left + 'px';
          var top = r.bottom + 6;
          if (top + pop.offsetHeight > window.innerHeight - 8) {
            top = r.top - 6 - pop.offsetHeight; // tenta abrir para cima
            if (top < 8) top = window.innerHeight - pop.offsetHeight - 8; // senão, encaixa na tela
            if (top < 8) top = 8;
          }
          pop.style.top = top + 'px';
        }
        return;
      }
      var item = (e.target as HTMLElement).closest(
        '.cli-menu-item',
      ) as HTMLElement;
      if (item) {
        var row = item.closest('tr') as HTMLElement;
        var act = item.getAttribute('data-act');
        if (act && row) {
          // 'renew' saiu: era item de menu que so reclicava o botao ↻ Renovar da
          // propria linha (.open-payment), entao duplicava a mesma acao.
          var map = { msg: '.open-whatsapp-message', edit: '.edit-cliente' };
          if (map[act]) {
            var t = row.querySelector(map[act]) as HTMLElement;
            if (t) t.click();
          } else if (act === 'archive') {
            var fa = row.querySelector(
              'form.archive-cliente',
            ) as HTMLFormElement;
            if (fa) {
              fa.requestSubmit ? fa.requestSubmit() : fa.submit();
            }
          } else if (act === 'unarchive') {
            var fu = row.querySelector(
              'form.unarchive-cliente',
            ) as HTMLFormElement;
            if (fu) {
              fu.requestSubmit ? fu.requestSubmit() : fu.submit();
            }
          } else if (act === 'delete') {
            var bd = row.querySelector(
              'form.delete-cliente button[type="submit"]',
            ) as HTMLFormElement;
            if (bd) bd.click();
          } else if (act === 'copy-payment') {
            var cid = item.getAttribute('data-cliente-id');
            if (cid) {
              fetch('/clientes/' + cid + '/link-pagamento')
                .then(function (r) {
                  return r.json();
                })
                .then(function (j) {
                  if (j && j.ok && j.url) {
                    if (navigator.clipboard)
                      navigator.clipboard
                        .writeText(j.url)
                        .catch(function () {});
                    showPanelNotice('Link de pagamento: ' + j.url, false, {
                      info: true,
                      title: 'Link pronto',
                    });
                  } else {
                    showError((j && j.error) || 'Falha ao gerar link.');
                  }
                })
                .catch(function () {
                  showError('Erro de rede ao gerar link.');
                });
            }
          }
        }
        closeAllMenus();
        return;
      }
      closeAllMenus();
    });
    on(window, 'scroll', closeAllMenus, true);
    on(window, 'resize', closeAllMenus);
    on(document, 'keydown', function (e) {
      const trigger = (e.target as HTMLElement).closest(
        '.cli-menu-btn',
      ) as HTMLElement;
      if (trigger && ['ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
        const items =
          trigger.parentElement.querySelectorAll<HTMLButtonElement>(
            '.cli-menu-item',
          );
        items[e.key === 'ArrowUp' ? items.length - 1 : 0]?.focus();
        return;
      }
      const menu = document.querySelector('.cli-menu-pop.open') as HTMLElement;
      if (!menu) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        const button = menu.parentElement.querySelector(
          '.cli-menu-btn',
        ) as HTMLElement;
        closeAllMenus();
        button?.focus();
      } else if (e.key === 'Tab') closeAllMenus();
      else if (
        menu.contains(e.target as Node) &&
        ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)
      ) {
        e.preventDefault();
        const items = Array.from(
          menu.querySelectorAll<HTMLButtonElement>('.cli-menu-item'),
        );
        const current = items.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        const next =
          e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? items.length - 1
              : (current + (e.key === 'ArrowDown' ? 1 : -1) + items.length) %
                items.length;
        items[next]?.focus();
      }
    });
  })();

  // -------- Sino de notificações --------
  on(document, 'click', async function (event) {
    var button = (event.target as HTMLElement).closest(
      '[data-confirm-renovacao]',
    ) as HTMLInputElement;
    if (!button) return;
    event.preventDefault();
    if (
      button.disabled ||
      !(await confirmPanelAction(
        'Você já renovou o acesso no outro painel? Confirmar atualiza o vencimento e desconta os créditos no gestor.',
        button,
        button,
      ))
    )
      return;
    button.disabled = true;
    var originalText = button.textContent;
    button.textContent = 'Confirmando…';
    try {
      var response = await window.csrfFetch(
        '/pagamentos/' +
          encodeURIComponent(button.dataset.confirmRenovacao) +
          '/confirmar-renovacao',
        { method: 'POST' },
      );
      var result = await response.json();
      if (!response.ok || !result.ok)
        throw Error(result.error || 'Não foi possível confirmar a renovação.');
      if (window.gestorNavigate) await window.gestorNavigate('/clientes');
      else location.assign('/clientes');
    } catch (error) {
      showError(
        error.message ||
          'Falha ao confirmar. Confira o controle antes de tentar novamente.',
      );
      button.disabled = false;
      button.textContent = originalText;
    }
  });
  // Faz poll a cada 60s do GET /notificacoes. Quando o painel abre, marca todas
  // como lidas. Click numa notificação navega pra url + apaga visualmente.
  (function () {
    var wrap = document.querySelector('[data-notif-wrap]') as HTMLElement;
    if (!wrap) return;
    var toggle = wrap.querySelector('[data-notif-toggle]') as HTMLElement;
    var panel = wrap.querySelector('[data-notif-panel]') as HTMLElement;
    var list = wrap.querySelector('[data-notif-list]') as HTMLElement;
    var countEl = wrap.querySelector('[data-notif-count]') as HTMLElement;
    var clearBtn = wrap.querySelector('[data-notif-clear]') as HTMLElement;
    var state = { items: [], naoLidas: 0, open: false, intervalo: null };

    function fmtRel(iso) {
      if (!iso) return '';
      var normalized = iso.replace(' ', 'T');
      var d = new Date(
        /(?:Z|[+-]\d\d:\d\d)$/.test(normalized) ? normalized : normalized + 'Z',
      );
      if (isNaN(d.getTime())) return '';
      var diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return 'agora';
      if (diff < 3600) return Math.floor(diff / 60) + 'min';
      if (diff < 86400) return Math.floor(diff / 3600) + 'h';
      if (diff < 604800) return Math.floor(diff / 86400) + 'd';
      return d.toLocaleDateString('pt-BR');
    }
    function escapeHtml(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        }[c];
      });
    }
    function pintarBadge(n) {
      state.naoLidas = n;
      if (toggle) toggle.classList.toggle('has-unread', n > 0);
      if (!countEl) return;
      if (n > 0) {
        countEl.style.display = 'inline-flex';
        countEl.removeAttribute('hidden');
        countEl.textContent = n > 99 ? '99+' : String(n);
      } else {
        countEl.style.display = 'none';
        countEl.setAttribute('hidden', '');
        countEl.textContent = '';
      }
    }
    function pintarLista() {
      if (!list) return;
      if (!state.items.length) {
        list.innerHTML =
          '<li class="notif-empty">' +
          '<span class="notif-empty-ico" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>' +
          '<path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>' +
          '</svg>' +
          '</span>' +
          '<span class="notif-empty-title">Tudo em dia</span>' +
          '<span class="notif-empty-sub">Pagamentos recebidos e alertas de créditos aparecem aqui.</span>' +
          '</li>';
        return;
      }
      list.innerHTML = state.items
        .map(function (n) {
          var url = n.url || '#';
          return (
            '<li class="notif-item ' +
            (n.lida ? '' : 'is-unread') +
            (n.pagamentoId ? ' has-renewal' : '') +
            '" data-id="' +
            n.id +
            '">' +
            '<a class="notif-item-link" href="' +
            escapeHtml(url) +
            '" data-notif-id="' +
            n.id +
            '">' +
            '<span class="notif-ico"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v4m0 4h.01"/></svg></span>' +
            '<span class="notif-body">' +
            '<span class="notif-title">' +
            escapeHtml(n.titulo) +
            '</span>' +
            (n.mensagem
              ? '<span class="notif-msg">' + escapeHtml(n.mensagem) + '</span>'
              : '') +
            '<span class="notif-time">' +
            fmtRel(n.createdAt) +
            '</span>' +
            '</span>' +
            '</a>' +
            (n.pagamentoId
              ? '<button type="button" class="notif-renew" data-confirm-renovacao="' +
                n.pagamentoId +
                '">Marcar como renovado</button>'
              : '<button type="button" class="notif-del" data-notif-del="' +
                n.id +
                '" title="Excluir" aria-label="Excluir">×</button>') +
            '</li>'
          );
        })
        .join('');
    }
    const notificationsKey = queryScope + ':notifications';
    var notificationsInflight = false;
    function carregar(refresh = false) {
      if (notificationsInflight || !window.gestorPolling.canFetch())
        return Promise.resolve(false);
      notificationsInflight = true;
      return readShellStatus(
        notificationsKey,
        '/notificacoes',
        refresh ? 1000 : 60000,
      )
        .then(function (j) {
          if (lifecycle.signal.aborted) return false;
          if (!j || !j.ok) throw new Error('notifications');
          state.items = j.items || [];
          pintarBadge(j.naoLidas || 0);
          if (state.open) pintarLista();
          return true;
        })
        .catch(function () {
          if (lifecycle.signal.aborted) return false;
          if (state.open)
            list.innerHTML =
              '<li class="notif-empty" role="status">Não foi possível carregar os alertas. Feche e abra o sino para tentar novamente.</li>';
          return false;
        })
        .then(function (loaded) {
          notificationsInflight = false;
          return loaded;
        });
    }
    function abrir() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      state.open = true;
      pintarLista();
      carregar(true).then(function (loaded) {
        if (!loaded || !state.open) return;
        if (state.naoLidas > 0) {
          window
            .csrfFetch('/notificacoes/marcar-todas-lidas', { method: 'POST' })
            .then(function (r) {
              if (!r.ok) throw new Error('notifications');
              shellReads.delete(notificationsKey);
              state.items.forEach(function (n) {
                n.lida = 1;
              });
              pintarBadge(0);
              pintarLista();
            })
            .catch(function () {});
        }
      });
    }
    function fechar() {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      state.open = false;
    }
    on(toggle, 'click', function (e) {
      e.stopPropagation();
      if (state.open) fechar();
      else abrir();
    });
    on(document, 'click', function (e) {
      if (state.open && !wrap.contains(e.target as HTMLElement)) fechar();
    });
    on(document, 'keydown', function (e) {
      if (e.key === 'Escape' && state.open) fechar();
    });
    on(document, 'gestor:before-swap', fechar);
    on(document, 'gestor:navigated', () => carregar());

    on(list, 'click', function (e) {
      var del = (e.target as HTMLElement).closest(
        '[data-notif-del]',
      ) as HTMLElement;
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        var id = del.getAttribute('data-notif-del');
        window
          .csrfFetch('/notificacoes/' + id + '/excluir', { method: 'POST' })
          .then(function (r) {
            if (!r.ok) throw new Error('notifications');
            shellReads.delete(notificationsKey);
            state.items = state.items.filter(function (n) {
              return String(n.id) !== String(id);
            });
            pintarBadge(
              state.items.filter(function (n) {
                return !n.lida;
              }).length,
            );
            pintarLista();
          })
          .catch(function () {});
        return;
      }
      var link = (e.target as HTMLElement).closest(
        '[data-notif-id]',
      ) as HTMLAnchorElement;
      if (link) {
        var url = link.getAttribute('href');
        if (!url || url === '#') {
          e.preventDefault();
          return;
        }
        // deixa o browser navegar normal
      }
    });
    on(clearBtn, 'click', async function () {
      if (!state.items.length) return;
      if (
        !(await confirmPanelAction(
          'Limpar os avisos? As renovações pendentes serão mantidas.',
          clearBtn,
          clearBtn,
        ))
      )
        return;
      window
        .csrfFetch('/notificacoes/limpar', { method: 'POST' })
        .then(function (r) {
          if (!r.ok) throw new Error('notifications');
          shellReads.delete(notificationsKey);
          carregar();
        })
        .catch(function () {});
    });

    carregar();
    state.intervalo = setInterval(function () {
      if (document.visibilityState === 'visible') carregar(true);
    }, 60000);
    on(document, 'visibilitychange', function () {
      if (document.visibilityState === 'visible') carregar(true);
    });
  })();

  // -------- PWA: registra Service Worker + helpers de push --------
  // Service worker é obrigatório pro Chrome oferecer "Instalar app". Push
  // notification não é registrado automaticamente — o user precisa pedir via
  // window.pushSubscribe() (botão na conta) pra abrir o popup de permissão.
  // Ao restaurar uma página pelo histórico, busca um documento atual.
  on(window, 'pageshow', function (event: PageTransitionEvent) {
    if (event.persisted) window.location.reload();
  });
  if ('serviceWorker' in navigator && !window.__gestorPwaManaged) {
    var workerScript = document.querySelector(
      'script[data-service-worker-url]',
    ) as HTMLScriptElement;
    var workerUrl = workerScript
      ? workerScript.getAttribute('data-service-worker-url')
      : '/sw.js';
    navigator.serviceWorker
      .register(workerUrl, { updateViaCache: 'none' })
      .then(function (registration) {
        if (lifecycle.signal.aborted) return;
        const updateWorker = function () {
          if (document.visibilityState === 'visible')
            registration.update().catch(function () {});
        };
        on(document, 'visibilitychange', updateWorker);
        setInterval(updateWorker, 60000);
        updateWorker();
      })
      .catch(function () {
        /* ignora — site segue funcionando */
      });
  }

  function urlBase64ToUint8Array(base64) {
    var padding = '='.repeat((4 - (base64.length % 4)) % 4);
    var b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(b64);
    var arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }

  function pushRegistration() {
    return new Promise<ServiceWorkerRegistration>((resolve, reject) => {
      const timer = window.setTimeout(
        () =>
          reject(
            new Error('O aplicativo ainda não está pronto. Tente novamente.'),
          ),
        10000,
      );
      navigator.serviceWorker.ready.then(
        (registration) => {
          window.clearTimeout(timer);
          resolve(registration);
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  // Chamada por botão "Ativar notificações" em /minha-conta.
  window.pushSubscribe = async function () {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      showError('Seu navegador não suporta notificações.');
      return false;
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        showError('Permissão negada. Habilite nas configurações do navegador.');
        return false;
      }
      var kr = await fetch('/push/public-key', {
        signal: AbortSignal.timeout(15000),
      }).then(function (r) {
        return r.json();
      });
      if (!kr.ok || !kr.enabled || !kr.key) {
        showError('Push não está configurado no servidor.');
        return false;
      }
      var reg = await pushRegistration();
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(kr.key),
      });
      var r = await window.csrfFetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
        signal: AbortSignal.timeout(15000),
      });
      var j = await r.json();
      if (!j.ok) {
        showError('Falha ao registrar: ' + (j.error || '?'));
        return false;
      }
      return true;
    } catch (e) {
      showError(
        'Erro ao ativar notificações: ' + (e && e.message ? e.message : e),
      );
      return false;
    }
  };

  window.pushUnsubscribe = async function () {
    if (!('serviceWorker' in navigator)) return false;
    try {
      var reg = await pushRegistration();
      var sub = await reg.pushManager.getSubscription();
      if (!sub) return true;
      var response = await window.csrfFetch('/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok || !(await response.json()).ok) return false;
      return await sub.unsubscribe();
    } catch (e) {
      return false;
    }
  };

  // Status atual: subscrito ou não? Pra UI mostrar o botão certo.
  window.pushStatus = async function () {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    )
      return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      var reg = await pushRegistration();
      var sub = await reg.pushManager.getSubscription();
      return sub ? 'subscribed' : 'available';
    } catch {
      return 'available';
    }
  };
};
window.__gestorInitShell();
