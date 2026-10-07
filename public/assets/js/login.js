(() => {
  const form = document.querySelector('.login-form');
  if (!form) return;
  const password = form.querySelector('[name="password"]');
  const toggle = form.querySelector('[data-login-password-toggle]');
  toggle?.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    toggle.textContent = show ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    toggle.setAttribute('aria-pressed', String(show));
  });
  let busy = false;
  const button = form.querySelector('button[type="submit"]');
  const original = button?.innerHTML;
  const reset = () => {
    busy = false;
    if (button) { button.disabled = false; button.innerHTML = original; }
  };
  window.addEventListener('pageshow', reset);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    if (button) { button.disabled = true; button.textContent = 'Entrando…'; }
    form.querySelector('[data-login-error]')?.remove();
    try {
      // Uma aba antiga pode ter o token anterior a um login/logout ou deploy.
      const response = await fetch('/login', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error('Não foi possível preparar o login. Tente novamente.');
      if (new URL(response.url).pathname !== '/login') { location.assign(response.url); return; }
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      const token = doc.querySelector('.login-form input[name="_csrf"]')?.value;
      if (!token) throw new Error('Não foi possível atualizar sua sessão. Reabra a página de login.');
      const check = await fetch('/login?session_check=1', {
        cache: 'no-store', credentials: 'same-origin',
        headers: { Accept: 'application/json', 'x-csrf-token': token },
      });
      if (new URL(check.url).pathname !== '/login') { location.assign(check.url); return; }
      if (!check.ok || !(await check.json()).ok) {
        throw new Error('O navegador não manteve sua sessão. Permita cookies para este site e tente novamente. Se continuar, os dados da sessão não estão sendo preservados pelo servidor.');
      }
      form.querySelector('input[name="_csrf"]').value = token;
      // Envia as credenciais uma única vez, após receber o cookie atualizado.
      HTMLFormElement.prototype.submit.call(form);
    } catch (error) {
      const notice = document.createElement('p');
      notice.className = 'form-alert error';
      notice.dataset.loginError = '';
      notice.setAttribute('role', 'alert');
      notice.textContent = error.message || 'Falha de conexão. Tente novamente.';
      form.prepend(notice);
      reset();
    }
  });
})();
