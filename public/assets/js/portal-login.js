(() => {
  const form = document.querySelector('.portal-login form');
  if (!form) return;
  const error = document.getElementById('login-error');
  form.noValidate = true;
  form.addEventListener('submit', (event) => {
    const login = form.elements.login;
    const password = form.elements.password;
    login.removeAttribute('aria-invalid');
    password.removeAttribute('aria-invalid');
    const missing = !login.value.trim()
      ? login
      : !password.value
        ? password
        : null;
    if (missing) {
      event.preventDefault();
      error.textContent =
        missing === login
          ? 'Informe seu usuário IPTV.'
          : 'Informe sua senha IPTV.';
      error.hidden = false;
      missing.setAttribute('aria-invalid', 'true');
      missing.setAttribute('aria-describedby', 'login-error');
      missing.focus();
    }
  });
})();
