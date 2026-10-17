(() => {
  try {
    const theme = localStorage.getItem('gestor-theme');
    if (theme === 'light' || theme === 'dark')
      document.documentElement.dataset.theme = theme;
  } catch {
    /* O aviso tambem funciona sem armazenamento. */
  }
  const status = document.getElementById('status');
  const retry = () => {
    if (status) status.textContent = 'Reconectando…';
    if (location.pathname === '/offline.html') location.replace('/dashboard');
    else location.reload();
  };
  document.getElementById('retry-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    retry();
  });
  window.addEventListener('online', retry);
  if (navigator.onLine === false && status)
    status.textContent = 'Você está offline.';
})();
