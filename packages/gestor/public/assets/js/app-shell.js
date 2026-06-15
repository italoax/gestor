(function () {
  // Obs.: a troca de tema (claro/escuro) é feita pelo main.js via [data-theme-toggle].
  var shell = document.querySelector('[data-shell]');

  // Recolher menu lateral (persistido)
  try { if (localStorage.getItem('gestor-sidebar') === 'collapsed' && shell) shell.classList.add('sidebar-collapsed'); } catch (e) {}
  var collapseBtn = document.querySelector('[data-sidebar-toggle]');
  if (collapseBtn && shell) {
    collapseBtn.addEventListener('click', function () {
      var c = shell.classList.toggle('sidebar-collapsed');
      try { localStorage.setItem('gestor-sidebar', c ? 'collapsed' : 'open'); } catch (e) {}
    });
  }

  // Menu lateral no mobile (overlay)
  var burger = document.querySelector('[data-sidebar-mobile]');
  var backdrop = document.querySelector('[data-sidebar-backdrop]');
  function closeMobile() { if (shell) shell.classList.remove('sidebar-open'); }
  if (burger && shell) burger.addEventListener('click', function () { shell.classList.toggle('sidebar-open'); });
  if (backdrop) backdrop.addEventListener('click', closeMobile);

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

  // Status do WhatsApp no topo
  var waChip = document.querySelector('[data-wa-chip]');
  var waCount = document.querySelector('[data-wa-count]');
  if (waChip) {
    fetch('/whatsapp/status', { headers: { 'Accept': 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (s) {
        if (!s) return;
        var connected = s.connected || s.status === 'conectado';
        waChip.classList.toggle('is-on', connected);
        waChip.classList.toggle('is-off', !connected);
        if (waCount) waCount.textContent = connected ? 'on' : 'off';
      })
      .catch(function () {});
  }

  // Copiar ID do cliente (botão ⧉ na tabela)
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    var val = btn.getAttribute('data-copy') || '';
    if (navigator.clipboard) navigator.clipboard.writeText(val).catch(function () {});
    var old = btn.textContent;
    btn.textContent = '✓';
    setTimeout(function () { btn.textContent = old; }, 1000);
  });

  // Selecionar todos os clientes (checkbox do cabeçalho)
  document.querySelectorAll('[data-check-all]').forEach(function (master) {
    master.addEventListener('change', function () {
      var scope = master.closest('table') || document;
      scope.querySelectorAll('tbody .cli-check').forEach(function (cb) { cb.checked = master.checked; });
    });
  });

  // Menu de ações (3 pontos) nas linhas da tabela de clientes
  (function () {
    function closeAllMenus() {
      document.querySelectorAll('.cli-menu-pop.open').forEach(function (p) {
        p.classList.remove('open');
        p.hidden = true;
        var b = p.parentElement && p.parentElement.querySelector('.cli-menu-btn');
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
          pop.style.top = (r.bottom + 6) + 'px';
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
          var map = { msg: '.open-whatsapp-message', edit: '.edit-cliente', renew: '.open-payment' };
          if (map[act]) {
            var t = row.querySelector(map[act]);
            if (t) t.click();
          } else if (act === 'archive') {
            var fa = row.querySelector('form.archive-cliente');
            if (fa) { fa.requestSubmit ? fa.requestSubmit() : fa.submit(); }
          } else if (act === 'unarchive') {
            var fu = row.querySelector('form.unarchive-cliente');
            if (fu) { fu.requestSubmit ? fu.requestSubmit() : fu.submit(); }
          } else if (act === 'delete') {
            var bd = row.querySelector('form.delete-cliente button[type="submit"]');
            if (bd) bd.click();
          }
        }
        closeAllMenus();
        return;
      }
      closeAllMenus();
    });
    window.addEventListener('scroll', closeAllMenus, true);
    window.addEventListener('resize', closeAllMenus);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllMenus(); });
  })();

  // Texto dinâmico do modal de plano
  var planoInfo = document.querySelector('[data-plano-info]');
  if (planoInfo) {
    var pPer = document.querySelector('#modal-add-plano-form [name="periodo"]');
    var pCred = document.querySelector('#modal-add-plano-form [name="creditos"]');
    var updPlano = function () {
      var per = (pPer && pPer.value) || '0';
      var cred = (pCred && pCred.value) || '0';
      planoInfo.innerHTML = 'Este plano terá duração de <strong>' + per + ' dias</strong> e consumirá <strong>' + cred + ' crédito(s)</strong> do servidor ao renovar.';
    };
    if (pPer) pPer.addEventListener('input', updPlano);
    if (pCred) pCred.addEventListener('input', updPlano);
  }
})();
