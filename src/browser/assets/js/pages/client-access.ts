import {
  createPanelNotice,
  dismissPanelNotice,
  showPanelNotice,
} from '../ui/panel-feedback.js';
window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initClientAccess = function ({ on, setModalState }) {
  const accessModal = document.getElementById(
    'modal-client-access',
  ) as HTMLElement;
  if (accessModal) {
    let accessId = null;
    let accessBlocked = false;
    let busy = false;
    const csrfToken = () =>
      window.getCsrfToken?.() ||
      (accessModal.querySelector('[name="_csrf"]') as HTMLInputElement).value;
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
    const showResult = (text: string, error = false, title?: string) => {
      setNotice('');
      showPanelNotice(text, error, { title });
    };
    const actions = accessModal.querySelector(
      '[data-access-actions]',
    ) as HTMLElement;
    const toggle = accessModal.querySelector(
      '[data-access-toggle]',
    ) as HTMLButtonElement;
    const copyLink = accessModal.querySelector(
      '[data-access-copy]',
    ) as HTMLButtonElement;
    const linkInput = accessModal.querySelector(
      '[data-access-link]',
    ) as HTMLInputElement;
    const loadingButton = (button: HTMLButtonElement, text: string) => {
      const label = button.textContent;
      const spinner = document.createElement('span');
      spinner.className = 'btn-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      button.setAttribute('aria-busy', 'true');
      button.replaceChildren(spinner, document.createTextNode(' ' + text));
      setNotice('');
      dismissPanelNotice();
      return () => {
        button.removeAttribute('aria-busy');
        button.textContent =
          button === toggle
            ? accessBlocked
              ? 'Habilitar acesso'
              : 'Desativar acesso'
            : label;
      };
    };
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
      copyLink.disabled = busy || c.blocked;
      (
        accessModal.querySelector('[data-access-name]') as HTMLElement
      ).textContent = c.nome;
      (
        accessModal.querySelector('[data-access-user]') as HTMLElement
      ).textContent = 'Usuário IPTV: ' + c.user;
      (
        accessModal.querySelector('[data-access-state]') as HTMLElement
      ).textContent = c.blocked ? 'Desativado' : 'Habilitado';
      if (!toggle.hasAttribute('aria-busy'))
        toggle.textContent = c.blocked
          ? 'Habilitar acesso'
          : 'Desativar acesso';
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
      copyLink.disabled = true;
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
      copyLink.disabled = toggle.disabled = true;
      const stopLoading = loadingButton(
        toggle,
        action === 'disable' ? 'Desativando?' : 'Habilitando?',
      );
      try {
        const body = new URLSearchParams({
          id: accessId,
          action,
          _csrf: csrfToken(),
        });
        const r = await fetch('/acessos-clientes', {
          method: 'POST',
          body,
          headers: { Accept: 'application/json', 'x-gestor-action': '1' },
        });
        const result = r.headers
          .get('content-type')
          ?.includes('application/json')
          ? await r.json()
          : null;
        if (!r.ok || !result || result.ok === false)
          throw Error(
            result?.error ||
              (r.status === 403
                ? 'Sua sessão expirou. Recarregue a página.'
                : 'Não foi possível salvar. Tente novamente.'),
          );
        linkInput.value = '';
        linkInput.hidden = true;
        await loadAccess(accessId);
        showResult(
          result.message,
          false,
          accessBlocked ? 'Acesso desativado' : 'Acesso habilitado',
        );
      } catch (e) {
        showResult(e.message, true);
      } finally {
        stopLoading();
        busy = false;
        toggle.disabled = false;
        copyLink.disabled = accessBlocked;
      }
    };
    toggle.onclick = () => saveAccess(accessBlocked ? 'enable' : 'disable');
    copyLink.onclick = async () => {
      if (busy || accessBlocked) return;
      busy = true;
      copyLink.disabled = toggle.disabled = true;
      const stopLoading = loadingButton(copyLink, 'Copiando…');
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
          showResult('Link de acesso copiado!', false, 'Link copiado');
        } catch {
          linkInput.focus();
          linkInput.select();
          showResult(
            'Selecione e copie o link no campo acima.',
            false,
            'Link pronto',
          );
        }
      } catch (e) {
        showResult(e.message, true);
      } finally {
        stopLoading();
        busy = false;
        copyLink.disabled = accessBlocked;
        toggle.disabled = false;
      }
    };
  }
};
