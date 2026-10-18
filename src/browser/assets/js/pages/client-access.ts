import { createPanelNotice } from '../ui/panel-feedback.js';
window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initClientAccess = function ({ on, setModalState }) {
  const accessModal = document.getElementById(
    'modal-client-access',
  ) as HTMLElement;
  if (accessModal) {
    let accessId = null;
    let accessBlocked = false;
    let busy = false;
    const notice = accessModal.querySelector(
      '[data-access-notice]',
    ) as HTMLElement;
    const setNotice = (text: string, error = false, pending = false) => {
      notice.replaceChildren(
        ...(text
          ? [createPanelNotice(text, { inline: true, error, pending })]
          : []),
      );
    };
    const actions = accessModal.querySelector(
      '[data-access-actions]',
    ) as HTMLElement;
    const toggle = accessModal.querySelector(
      '[data-access-toggle]',
    ) as HTMLInputElement;
    const revoke = accessModal.querySelector(
      '[data-access-revoke]',
    ) as HTMLInputElement;
    const copyLink = accessModal.querySelector(
      '[data-access-copy]',
    ) as HTMLInputElement;
    const linkInput = accessModal.querySelector(
      '[data-access-link]',
    ) as HTMLInputElement;
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
      (
        accessModal.querySelector('[data-access-state]') as HTMLElement
      ).classList.toggle('is-blocked', c.blocked);
      copyLink.disabled = c.blocked;
      (
        accessModal.querySelector('[data-access-name]') as HTMLElement
      ).textContent = c.nome;
      (
        accessModal.querySelector('[data-access-user]') as HTMLElement
      ).textContent = 'Usuário IPTV: ' + c.user;
      (
        accessModal.querySelector('[data-access-state]') as HTMLElement
      ).textContent = c.blocked ? 'Desativado' : 'Habilitado';
      toggle.textContent = c.blocked ? 'Habilitar acesso' : 'Desativar acesso';
      revoke.disabled = !c.hasLink;
      actions.hidden = false;
    };
    on(document, 'click', async (event) => {
      const trigger = (event.target as HTMLElement).closest(
        '[data-client-access]',
      ) as HTMLElement;
      if (!trigger || busy) return;
      accessId = trigger.getAttribute('data-client-access');
      linkInput.value = '';
      linkInput.hidden = true;
      actions.hidden = true;
      (
        accessModal.querySelector('[data-access-name]') as HTMLElement
      ).textContent = '';
      (
        accessModal.querySelector('[data-access-user]') as HTMLElement
      ).textContent = '';
      (
        accessModal.querySelector('[data-access-state]') as HTMLElement
      ).textContent = '';
      setNotice('Carregando…', false, true);
      setModalState(accessModal, true);
      try {
        await loadAccess(accessId);
        setNotice('');
      } catch (e) {
        setNotice(e.message, true);
      }
    });
    const saveAccess = async (action) => {
      if (busy) return;
      busy = true;
      toggle.disabled = revoke.disabled = true;
      setNotice('Salvando…', false, true);
      try {
        const body = new URLSearchParams({
          id: accessId,
          action,
          _csrf: (
            accessModal.querySelector('[name="_csrf"]') as HTMLInputElement
          ).value,
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
        setNotice(result.message);
      } catch (e) {
        setNotice(e.message, true);
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
      setNotice('Preparando link…', false, true);
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
          setNotice('Link de acesso copiado!');
        } catch {
          linkInput.focus();
          linkInput.select();
          setNotice('Selecione e copie o link no campo acima.');
        }
      } catch (e) {
        setNotice(e.message, true);
      } finally {
        busy = false;
        copyLink.disabled = accessBlocked;
        toggle.disabled = false;
      }
    };
  }
};
