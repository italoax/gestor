// A senha cadastrada só é consultada quando o usuário solicita sua exibição.
export function initPasswordField(field: HTMLElement) {
  const input = field.querySelector('input') as HTMLInputElement;
  const toggle = field.querySelector(
    '[data-password-toggle]',
  ) as HTMLButtonElement;
  const feedback = field.querySelector(
    '[data-password-feedback]',
  ) as HTMLElement;
  const label = toggle.querySelector('[data-password-toggle-label]');
  let pending: AbortController | null = null;
  let savedPassword: string | null = null;
  const visibility = (show: boolean) => {
    input.type = show ? 'text' : 'password';
    toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    toggle.title = toggle.getAttribute('aria-label');
    toggle.setAttribute('aria-pressed', String(show));
    if (label) label.textContent = show ? 'Ocultar' : 'Mostrar';
  };
  const cancel = () => {
    pending?.abort();
    pending = null;
    toggle.disabled = false;
    toggle.removeAttribute('aria-busy');
  };
  const reset = () => {
    cancel();
    savedPassword = null;
    visibility(false);
    feedback.textContent = '';
  };
  input.addEventListener('input', () => {
    cancel();
    feedback.textContent = '';
  });
  toggle.onclick = async () => {
    const url = field.dataset.passwordSavedUrl;
    const remove = input.form?.querySelector<HTMLInputElement>(
      '[name="limpar_senha"]',
    );
    feedback.textContent = '';
    if (input.type === 'password' && !input.value && url && !remove?.checked) {
      const controller = new AbortController();
      pending = controller;
      toggle.disabled = true;
      toggle.setAttribute('aria-busy', 'true');
      feedback.textContent = 'Consultando senha salva…';
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(15000),
          ]),
        });
        if (!response.ok || response.redirected) throw Error();
        const data = await response.json();
        if (!data.ok || typeof data.senha !== 'string') throw Error();
        if (
          controller.signal.aborted ||
          !field.isConnected ||
          field.dataset.passwordSavedUrl !== url ||
          input.value ||
          remove?.checked ||
          field.closest('.modal-overlay')?.getAttribute('aria-hidden') ===
            'true'
        )
          return;
        savedPassword = data.senha;
        input.value = data.senha;
        feedback.textContent = data.senha ? '' : 'Nenhuma senha cadastrada.';
        if (data.senha) visibility(true);
      } catch {
        if (!controller.signal.aborted)
          feedback.textContent =
            'Não foi possível consultar a senha. Tente novamente.';
      } finally {
        if (pending === controller) cancel();
      }
      return;
    }
    visibility(input.type === 'password');
  };
  input.form?.addEventListener('reset', reset);
  // Consultar a senha não deve reenviá-la ao salvar outros dados do cliente.
  input.form?.addEventListener('formdata', (event) => {
    if (savedPassword !== null && input.value === savedPassword)
      event.formData.set(input.name, '');
  });
  reset();
}
