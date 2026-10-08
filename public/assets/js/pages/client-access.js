window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initClientAccess = function ({ on, setModalState }) {
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
};
