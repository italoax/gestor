window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initWhatsappMessages = function ({ setModalState }) {
  (
    document.querySelectorAll(
      '.open-whatsapp-message',
    ) as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-send-whatsapp',
      ) as HTMLElement;
      if (!modal) return;
      const form = modal.querySelector(
        '#modal-send-whatsapp-form',
      ) as HTMLFormElement;
      if (!form) return;
      form.reset();
      (form.querySelector('[name="id"]') as HTMLInputElement).value =
        btn.getAttribute('data-id') || '';
      const nome = btn.getAttribute('data-nome') || '';
      const tel = btn.getAttribute('data-telefone') || '';
      const nomeEl = modal.querySelector('[data-wa-nome]') as HTMLElement;
      if (nomeEl) nomeEl.textContent = nome || '—';
      const telEl = modal.querySelector('[data-wa-telefone]') as HTMLElement;
      if (telEl) telEl.textContent = tel;
      // reseta a mídia
      const mt = form.querySelector('[name="media_tipo"]') as HTMLInputElement;
      if (mt) mt.value = '';
      const murl = form.querySelector('.wa-media-url') as HTMLInputElement;
      if (murl) {
        murl.hidden = true;
        murl.value = '';
      }
      (
        form.querySelectorAll('[data-wa-media]') as NodeListOf<HTMLElement>
      ).forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      setModalState(modal, true);
    });
  });

  // Template (opcional) -> preenche o textarea da mensagem
  const waTemplate = document.querySelector(
    '#modal-send-whatsapp-form [data-wa-template]',
  ) as HTMLSelectElement;
  const waMensagem = document.querySelector(
    '#modal-send-whatsapp-form [data-wa-mensagem]',
  ) as HTMLInputElement;
  if (waTemplate && waMensagem) {
    waTemplate.addEventListener('change', () => {
      const opt = waTemplate.options[waTemplate.selectedIndex];
      const msg = opt ? opt.getAttribute('data-message') || '' : '';
      if (msg) waMensagem.value = msg;
    });
  }

  // Botões de Anexar Mídia: define o tipo e mostra o campo de link
  const waForm = document.getElementById(
    'modal-send-whatsapp-form',
  ) as HTMLFormElement;
  if (waForm) {
    const urlInput = waForm.querySelector('.wa-media-url') as HTMLElement;
    const tipoInput = waForm.querySelector(
      '[name="media_tipo"]',
    ) as HTMLInputElement;
    (
      waForm.querySelectorAll('[data-wa-media]') as NodeListOf<HTMLElement>
    ).forEach((b) => {
      b.addEventListener('click', () => {
        const ativo = b.classList.contains('active');
        (
          waForm.querySelectorAll('[data-wa-media]') as NodeListOf<HTMLElement>
        ).forEach((x) => {
          x.classList.remove('active');
          x.setAttribute('aria-pressed', 'false');
        });
        if (ativo) {
          if (tipoInput) tipoInput.value = '';
          if (urlInput) {
            urlInput.hidden = true;
          }
        } else {
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
          if (tipoInput)
            tipoInput.value = b.getAttribute('data-wa-media') || '';
          if (urlInput) {
            urlInput.hidden = false;
            urlInput.focus();
          }
        }
      });
    });
  }
};
