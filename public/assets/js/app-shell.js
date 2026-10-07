(function () {
  // Obs.: a troca de tema (claro/escuro) é feita pelo main.js via [data-theme-toggle].
  var shell = document.querySelector('[data-shell]');

  // ----- CSRF helper -----
  // O token vem como meta tag no <head>. Toda chamada AJAX POST/PUT/DELETE
  // precisa enviar como `x-csrf-token`, senão o middleware csrfMiddleware
  // rejeita com 403. Expomos window.csrfFetch(url, opts) como wrapper
  // automático — apenas use em vez de fetch direto.
  window.getCsrfToken = function () {
    var m = document.querySelector('meta[name="csrf-token"]');
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
  var menuButtons = document.querySelectorAll('[data-sidebar-mobile]');
  var backdrop = document.querySelector('[data-sidebar-backdrop]');
  function setMobileMenu(open) {
    if (shell) shell.classList.toggle('sidebar-open', open);
    menuButtons.forEach(function (button) {
      button.setAttribute('aria-expanded', String(open));
    });
  }
  function closeMobile() { setMobileMenu(false); }
  menuButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (shell) setMobileMenu(!shell.classList.contains('sidebar-open'));
    });
  });
  if (backdrop) backdrop.addEventListener('click', closeMobile);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMobile();
  });
  function updateDock(event) {
    closeMobile();
    var path = event?.detail?.url ? new URL(event.detail.url, location.href).pathname : location.pathname;
    document.querySelectorAll('[data-dock-link]').forEach(function (link) {
      var active = path === link.pathname || path.startsWith(link.pathname + '/');
      link.classList.toggle('is-active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }
  updateDock();
  document.addEventListener('gestor:navigated', updateDock);
  document.addEventListener('gestor:navigation-start', updateDock);
  document.addEventListener('gestor:navigation-finished', updateDock);

  var accountWrap = document.querySelector('[data-account-menu-wrap]');
  var accountToggle = document.querySelector('[data-account-menu-toggle]');
  var accountMenu = document.querySelector('[data-account-menu]');
  function closeAccountMenu() {
    if (!accountMenu || !accountToggle) return;
    accountMenu.hidden = true;
    accountToggle.setAttribute('aria-expanded', 'false');
  }
  document.addEventListener('gestor:before-swap', closeAccountMenu);
  if (accountToggle && accountMenu) {
    accountToggle.addEventListener('click', function () {
      var open = accountMenu.hidden;
      accountMenu.hidden = !open;
      accountToggle.setAttribute('aria-expanded', String(open));
    });
    document.addEventListener('click', function (event) {
      if (
        !accountWrap.contains(event.target) ||
        event.target.closest('[data-account-menu] a')
      )
        closeAccountMenu();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !accountMenu.hidden) {
        closeAccountMenu();
        accountToggle.focus();
      }
    });
    document.addEventListener('focusin', function (event) {
      if (!accountWrap.contains(event.target)) closeAccountMenu();
    });
  }

  // Fechar banner do topo
  var bannerClose = document.querySelector('[data-dismiss-banner]');
  if (bannerClose) {
    bannerClose.addEventListener('click', function () {
      var banner = bannerClose.closest('.dash-banner');
      if (banner) banner.remove();
    });
  }

  // Atalho Ctrl+K para a busca
  var search = document.querySelector('[data-global-search]');
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (search) search.focus();
    }
  });

  // Status do WhatsApp no topo — pinta a bolinha (verde/vermelha) e popula o
  // tooltip com o número conectado. Atualiza a cada 30s pra refletir
  // reconexões/desconexões. Sem texto "on/off" exibido — só a bolinha.
  var waChip = document.querySelector('[data-wa-chip]');
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
  //  - Poll adaptativo: 5s no primeiro minuto, depois 30s.
  //  - Refetch imediato em visibilitychange/focus/pageshow — cobre o caso
  //    do user voltar pra aba/app depois de ficar em outro app.
  var waFetchInflight = false;
  function atualizarWaChip() {
    if (!waChip || waFetchInflight) return Promise.resolve();
    waFetchInflight = true;
    return fetch('/whatsapp/status', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (s) {
        if (!s) return; // resposta invalida — nao muda o estado
        // Erros e respostas incompletas não confirmam uma desconexão.
        var connected = s.connected === true || s.status === 'conectado';
        if (
          !connected &&
          ['desconectado', 'qr', 'iniciando'].indexOf(s.status) === -1
        )
          return;
        waChip.classList.toggle('is-on', connected);
        waChip.classList.toggle('is-off', !connected);
        try {
          sessionStorage.setItem(
            waChip.dataset.waStateKey,
            JSON.stringify({ connected: connected, at: Date.now() }),
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
      setTimeout(atualizarWaChip, 1500);
    }
  });
  // Polling adaptativo: 5s no primeiro minuto, depois 30s.
  if (waChip) {
    var waFastUntil = Date.now() + 60000;
    function waSchedule() {
      var delay = Date.now() < waFastUntil ? 5000 : 30000;
      setTimeout(function () {
        atualizarWaChip().finally(waSchedule);
      }, delay);
    }
    waSchedule();
    // Refetch quando o user volta pra aba (mobile: troca de app).
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') atualizarWaChip();
    });
    window.addEventListener('focus', atualizarWaChip);
    window.addEventListener('pageshow', atualizarWaChip);
  }

  // Copiar ID do cliente (botão ⧉ na tabela)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
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
  document.querySelectorAll('[data-check-all]').forEach(function (master) {
    master.addEventListener('change', function () {
      var scope = master.closest('table') || document;
      scope.querySelectorAll('tbody .cli-check').forEach(function (cb) {
        cb.checked = master.checked;
      });
    });
  });

  // Menu de ações (3 pontos) nas linhas da tabela de clientes
  (function () {
    function closeAllMenus() {
      document.querySelectorAll('.cli-menu-pop.open').forEach(function (p) {
        p.classList.remove('open');
        p.hidden = true;
        var b =
          p.parentElement && p.parentElement.querySelector('.cli-menu-btn');
        if (b) b.setAttribute('aria-expanded', 'false');
      });
    }
    document.addEventListener('click', function (e) {
      var trigger = e.target.closest('.cli-menu-btn');
      if (trigger) {
        e.preventDefault();
        e.stopPropagation();
        var pop = trigger.parentElement.querySelector('.cli-menu-pop');
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
      var item = e.target.closest('.cli-menu-item');
      if (item) {
        var row = item.closest('tr');
        var act = item.getAttribute('data-act');
        if (act && row) {
          // 'renew' saiu: era item de menu que so reclicava o botao ↻ Renovar da
          // propria linha (.open-payment), entao duplicava a mesma acao.
          var map = { msg: '.open-whatsapp-message', edit: '.edit-cliente' };
          if (map[act]) {
            var t = row.querySelector(map[act]);
            if (t) t.click();
          } else if (act === 'archive') {
            var fa = row.querySelector('form.archive-cliente');
            if (fa) {
              fa.requestSubmit ? fa.requestSubmit() : fa.submit();
            }
          } else if (act === 'unarchive') {
            var fu = row.querySelector('form.unarchive-cliente');
            if (fu) {
              fu.requestSubmit ? fu.requestSubmit() : fu.submit();
            }
          } else if (act === 'delete') {
            var bd = row.querySelector(
              'form.delete-cliente button[type="submit"]',
            );
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
                    if (typeof window.toast === 'function')
                      window.toast(
                        '✓ Link de pagamento copiado: ' + j.url,
                        'success',
                      );
                    else alert('Link copiado:\n' + j.url);
                  } else {
                    alert((j && j.error) || 'Falha ao gerar link.');
                  }
                })
                .catch(function () {
                  alert('Erro de rede ao gerar link.');
                });
            }
          }
        }
        closeAllMenus();
        return;
      }
      closeAllMenus();
    });
    window.addEventListener('scroll', closeAllMenus, true);
    window.addEventListener('resize', closeAllMenus);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllMenus();
    });
  })();

  // -------- Sino de notificações --------
  document.addEventListener('click', async function (event) {
    var button = event.target.closest('[data-confirm-renovacao]');
    if (!button) return;
    event.preventDefault();
    if (
      button.disabled ||
      !confirm(
        'Você já renovou o acesso no outro painel? Confirmar atualiza o vencimento e desconta os créditos no gestor.',
      )
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
      alert(
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
    var wrap = document.querySelector('[data-notif-wrap]');
    if (!wrap) return;
    var toggle = wrap.querySelector('[data-notif-toggle]');
    var panel = wrap.querySelector('[data-notif-panel]');
    var list = wrap.querySelector('[data-notif-list]');
    var countEl = wrap.querySelector('[data-notif-count]');
    var clearBtn = wrap.querySelector('[data-notif-clear]');
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
    function carregar() {
      return fetch('/notificacoes', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })
        .then(function (r) {
          if (!r.ok) throw new Error('notifications');
          return r.json();
        })
        .then(function (j) {
          if (!j || !j.ok) throw new Error('notifications');
          state.items = j.items || [];
          pintarBadge(j.naoLidas || 0);
          if (state.open) pintarLista();
          return true;
        })
        .catch(function () {
          if (state.open)
            list.innerHTML =
              '<li class="notif-empty" role="status">Não foi possível carregar os alertas. Feche e abra o sino para tentar novamente.</li>';
          return false;
        });
    }
    function abrir() {
      panel.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      state.open = true;
      pintarLista();
      carregar().then(function (loaded) {
        if (!loaded || !state.open) return;
        if (state.naoLidas > 0) {
          window
            .csrfFetch('/notificacoes/marcar-todas-lidas', { method: 'POST' })
            .then(function (r) {
              if (!r.ok) throw new Error('notifications');
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
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      if (state.open) fechar();
      else abrir();
    });
    document.addEventListener('click', function (e) {
      if (state.open && !wrap.contains(e.target)) fechar();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.open) fechar();
    });
    document.addEventListener('gestor:before-swap', fechar);
    document.addEventListener('gestor:navigated', carregar);

    list.addEventListener('click', function (e) {
      var del = e.target.closest('[data-notif-del]');
      if (del) {
        e.preventDefault();
        e.stopPropagation();
        var id = del.getAttribute('data-notif-del');
        window
          .csrfFetch('/notificacoes/' + id + '/excluir', { method: 'POST' })
          .then(function (r) {
            if (!r.ok) throw new Error('notifications');
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
      var link = e.target.closest('[data-notif-id]');
      if (link) {
        var url = link.getAttribute('href');
        if (!url || url === '#') {
          e.preventDefault();
          return;
        }
        // deixa o browser navegar normal
      }
    });
    clearBtn.addEventListener('click', function () {
      if (!state.items.length) return;
      if (!confirm('Limpar os avisos? As renovações pendentes serão mantidas.'))
        return;
      window
        .csrfFetch('/notificacoes/limpar', { method: 'POST' })
        .then(function (r) {
          if (!r.ok) throw new Error('notifications');
          carregar();
        })
        .catch(function () {});
    });

    carregar();
    state.intervalo = setInterval(function () {
      if (document.visibilityState === 'visible') carregar();
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') carregar();
    });
  })();

  // -------- PWA: registra Service Worker + helpers de push --------
  // Service worker é obrigatório pro Chrome oferecer "Instalar app". Push
  // notification não é registrado automaticamente — o user precisa pedir via
  // window.pushSubscribe() (botão na conta) pra abrir o popup de permissão.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function () {
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

  // Chamada por botão "Ativar notificações" em /minha-conta.
  window.pushSubscribe = async function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Seu navegador não suporta notificações.');
      return false;
    }
    try {
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        alert('Permissão negada. Habilite nas configurações do navegador.');
        return false;
      }
      var kr = await fetch('/push/public-key').then(function (r) {
        return r.json();
      });
      if (!kr.ok || !kr.enabled || !kr.key) {
        alert('Push não está configurado no servidor.');
        return false;
      }
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(kr.key),
      });
      var r = await window.csrfFetch('/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      var j = await r.json();
      if (!j.ok) {
        alert('Falha ao registrar: ' + (j.error || '?'));
        return false;
      }
      return true;
    } catch (e) {
      alert('Erro ao ativar notificações: ' + (e && e.message ? e.message : e));
      return false;
    }
  };

  window.pushUnsubscribe = async function () {
    if (!('serviceWorker' in navigator)) return false;
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) return true;
      await window.csrfFetch('/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      await sub.unsubscribe();
      return true;
    } catch (e) {
      return false;
    }
  };

  // Status atual: subscrito ou não? Pra UI mostrar o botão certo.
  window.pushStatus = async function () {
    if (!('serviceWorker' in navigator) || !('PushManager' in window))
      return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try {
      var reg = await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      return sub ? 'subscribed' : 'available';
    } catch {
      return 'available';
    }
  };
})();
