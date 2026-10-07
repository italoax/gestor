// Navegação compartilhada: mantém a estrutura do painel e busca dados atuais.
(function () {
  if (!document.querySelector('main.app-content') || window.gestorNavigate)
    return;
  const content = document.querySelector('main.app-content');
  const libraries = new Set(
    [...document.querySelectorAll('script[data-nav-once][src]')].map(
      (s) => s.src,
    ),
  );
  let sequence = 0,
    controller,
    saving = false;
  let currentUrl = location.href;
  const notice = document.createElement('div');
  notice.className = 'navigation-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.body.append(notice);
  function message(text) {
    notice.textContent = text;
    notice.hidden = false;
  }
  function rememberScroll() {
    if (location.href === currentUrl)
      history.replaceState(
        { ...history.state, scrollY: window.scrollY },
        '',
        location.href,
      );
  }
  history.replaceState(
    { ...history.state, scrollY: window.scrollY },
    '',
    location.href,
  );
  history.scrollRestoration = 'manual';

  function cleanup() {
    document.dispatchEvent(new Event('gestor:before-swap'));
    window.__gestorAbort?.abort();
    if (window.__waSessoesInterval) clearInterval(window.__waSessoesInterval);
    document.querySelector('[data-shell]')?.classList.remove('sidebar-open');
    document.querySelectorAll('.cli-menu-pop.open').forEach((p) => {
      p.classList.remove('open');
      p.hidden = true;
    });
    document.body.classList.remove('modal-open');
    document.documentElement.classList.remove('modal-open');
    document.documentElement.style.removeProperty('--modal-viewport-height');
    document.documentElement.style.removeProperty('--modal-viewport-top');
    document.querySelector('[data-notif-panel]')?.setAttribute('hidden', '');
    document
      .querySelector('[data-notif-toggle]')
      ?.setAttribute('aria-expanded', 'false');
  }

  async function scripts(token) {
    for (const old of [...content.querySelectorAll('script')]) {
      if (token !== sequence) return;
      if (
        old.type &&
        !['text/javascript', 'application/javascript', 'module'].includes(
          old.type,
        )
      )
        continue;
      if (
        old.src &&
        old.hasAttribute('data-nav-once') &&
        libraries.has(old.src)
      ) {
        old.remove();
        continue;
      }
      const script = document.createElement('script');
      for (const attr of old.attributes)
        script.setAttribute(attr.name, attr.value);
      script.async = false;
      script.textContent = old.textContent;
      if (script.src || script.type === 'module') {
        await new Promise((resolve) => {
          script.onload = () => {
            if (script.hasAttribute('data-nav-once')) libraries.add(script.src);
            resolve();
          };
          script.onerror = () => {
            console.warn('Recurso indisponível:', script.src);
            resolve();
          };
          old.replaceWith(script);
        });
      } else old.replaceWith(script);
    }
  }

  // Exposta também para ações que antes chamavam location.reload().
  async function navigate(
    url,
    {
      push = true,
      method = 'GET',
      body,
      keepScroll = false,
      scrollY,
      pop = false,
    } = {},
  ) {
    const destination = new URL(url, location.href);
    if (destination.origin !== location.origin) {
      location.assign(destination.href);
      return false;
    }
    if (saving) {
      if (pop) history.replaceState({ ...history.state }, '', currentUrl);
      message('Aguarde a conclusão do salvamento.');
      return false;
    }
    const mutation = method !== 'GET';
    saving = mutation;
    controller?.abort();
    controller = new AbortController();
    const token = ++sequence;
    const y = scrollY ?? (keepScroll ? window.scrollY : 0);
    if (!pop) rememberScroll();
    content.setAttribute('aria-busy', 'true');
    document.documentElement.classList.add('is-navigating');
    notice.hidden = true;
    try {
      const response = await fetch(destination.href, {
        method,
        body,
        signal: controller.signal,
        redirect: 'follow',
        cache: 'no-store',
        headers: {
          Accept: 'text/html',
          ...(mutation
            ? {
                'x-csrf-token': String(
                  body?.get('_csrf') || window.getCsrfToken?.() || '',
                ),
              }
            : {}),
        },
      });
      const html = await response.text();
      if (token !== sequence) return false;
      if (!response.headers.get('Content-Type')?.includes('text/html'))
        throw new Error('Resposta inesperada');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const next = doc.querySelector('main.app-content');
      const finalUrl = new URL(response.url || destination.href);
      // Login/saída e páginas públicas possuem outro layout e outra sessão.
      if (
        !next &&
        response.ok &&
        !doc.querySelector('main.app-content') &&
        doc.querySelector('body')
      ) {
        location.assign(finalUrl.href);
        return false;
      }
      if (!next || response.status >= 500)
        throw new Error('Resposta indisponível');
      cleanup();
      content.innerHTML = next.innerHTML;
      if (doc.title) document.title = doc.title;
      for (const selector of ['.topbar2-title', '.topbar-avatar']) {
        const current = document.querySelector(selector),
          replacement = doc.querySelector(selector);
        if (current && replacement) {
          current.innerHTML = replacement.innerHTML;
          current.title = replacement.title;
        }
      }
      const csrf = doc.querySelector('meta[name="csrf-token"]');
      if (csrf)
        document
          .querySelector('meta[name="csrf-token"]')
          ?.setAttribute('content', csrf.content);
      document.querySelectorAll('.sidebar-link').forEach((a) => {
        const path = new URL(a.href).pathname;
        const active =
          finalUrl.pathname === path ||
          finalUrl.pathname.startsWith(path + '/');
        a.classList.toggle('active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      });
      if (!pop && push && finalUrl.href !== currentUrl)
        history.pushState({ scrollY: y }, '', finalUrl.href);
      else
        history.replaceState(
          { ...history.state, scrollY: y },
          '',
          finalUrl.href,
        );
      currentUrl = finalUrl.href;
      try {
        sessionStorage.removeItem('gestor:scroll:' + finalUrl.pathname);
      } catch (_) {}
      await scripts(token);
      if (token !== sequence) return false;
      window.__gestorInitPage?.();
      window.scrollTo({ top: y, behavior: 'instant' });
      if (finalUrl.hash && !keepScroll && scrollY === undefined) {
        document
          .getElementById(decodeURIComponent(finalUrl.hash.slice(1)))
          ?.scrollIntoView();
      }
      if (!keepScroll && !pop) {
        const heading = document.querySelector('.topbar2-title h1');
        heading?.setAttribute('tabindex', '-1');
        heading?.focus({ preventScroll: true });
      }
      document.dispatchEvent(
        new CustomEvent('gestor:navigated', { detail: { url: currentUrl } }),
      );
      return true;
    } catch (error) {
      if (error.name === 'AbortError' || token !== sequence) return false;
      if (pop) history.replaceState({ ...history.state }, '', currentUrl);
      message(
        mutation
          ? 'Não foi possível confirmar o salvamento. Confira os dados antes de enviar novamente.'
          : 'Não foi possível carregar a página. Verifique sua conexão e tente novamente.',
      );
      return false;
    } finally {
      if (token === sequence) {
        saving = false;
        content.removeAttribute('aria-busy');
        document.documentElement.classList.remove('is-navigating');
      }
    }
  }
  window.gestorNavigate = navigate;
  window.gestorRefresh = () =>
    navigate(location.href, { push: false, keepScroll: true });

  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link = event.target.closest('a[href]');
    if (
      !link ||
      (link.target && link.target !== '_self') ||
      link.hasAttribute('download') ||
      link.hasAttribute('data-no-pjax')
    )
      return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol))
      return;
    if (
      url.pathname === location.pathname &&
      url.search === location.search &&
      url.hash
    )
      return;
    event.preventDefault();
    navigate(url.href);
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (
      event.defaultPrevented ||
      !(form instanceof HTMLFormElement) ||
      form.hasAttribute('data-no-pjax')
    )
      return;
    const submitter = event.submitter;
    const method = (
      submitter?.getAttribute('formmethod') ||
      form.getAttribute('method') ||
      'GET'
    ).toUpperCase();
    const url = new URL(
      submitter?.getAttribute('formaction') ||
        form.getAttribute('action') ||
        location.href,
      location.href,
    );
    const target =
      submitter?.getAttribute('formtarget') || form.getAttribute('target');
    if (
      (target && target !== '_self') ||
      url.origin !== location.origin ||
      !['GET', 'POST'].includes(method) ||
      url.pathname === '/logout'
    )
      return;
    event.preventDefault();
    if (form.dataset.pjaxBusy === '1' || saving) return;
    form.dataset.pjaxBusy = '1';
    const data = new FormData(form);
    if (submitter?.name) data.append(submitter.name, submitter.value);
    let body;
    if (method === 'GET') {
      url.search = '';
      data.forEach((value, key) => {
        if (!(value instanceof File)) url.searchParams.append(key, value);
      });
    } else if (
      (
        submitter?.getAttribute('formenctype') ||
        form.getAttribute('enctype') ||
        ''
      ).includes('multipart')
    )
      body = data;
    else {
      body = new URLSearchParams();
      data.forEach((value, key) => {
        if (!(value instanceof File)) body.append(key, value);
      });
    }
    const buttons = [
      ...document.querySelectorAll('button, input[type="submit"]'),
    ].filter(
      (b) => b.form === form && (b.type === 'submit' || b === submitter),
    );
    const originals = buttons.map((b) => ({
      b,
      disabled: b.disabled,
      text: b.dataset.prevText ?? b.innerHTML,
    }));
    buttons.forEach((b) => {
      b.disabled = true;
      b.classList.add('is-submitting');
      if (b.tagName === 'BUTTON' && !b.querySelector('.btn-spinner')) {
        const spinner = document.createElement('span');
        spinner.className = 'btn-spinner';
        spinner.setAttribute('aria-hidden', 'true');
        b.replaceChildren(
          spinner,
          document.createTextNode(' ' + (b.dataset.loadingText || 'Salvando')),
        );
      }
    });
    try {
      await navigate(url.href, { method, body, keepScroll: true });
    } finally {
      form.dataset.pjaxBusy = '';
      form.dataset.submitting = '';
      originals.forEach(({ b, disabled, text }) => {
        b.disabled = disabled;
        b.innerHTML = text;
        b.style.pointerEvents = '';
        b.classList.remove('is-submitting');
        delete b.dataset.submitting;
        delete b.dataset.prevText;
      });
    }
  });
  window.addEventListener('popstate', (event) =>
    navigate(location.href, {
      push: false,
      pop: true,
      scrollY: event.state?.scrollY || 0,
    }),
  );
  window.addEventListener('scroll', rememberScroll, { passive: true });
})();
