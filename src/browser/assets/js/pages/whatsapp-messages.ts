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
        murl.disabled = true;
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
      if (msg) {
        waMensagem.value = msg;
        waMensagem.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
  }

  // Botões de Anexar Mídia: define o tipo e mostra o campo de link
  const waForm = document.getElementById(
    'modal-send-whatsapp-form',
  ) as HTMLFormElement;
  if (waForm) {
    const urlInput = waForm.querySelector('.wa-media-url') as HTMLInputElement;
    const tipoInput = waForm.querySelector(
      '[name="media_tipo"]',
    ) as HTMLInputElement;
    let attempted = false;
    function setFieldError(field: HTMLElement, id: string, message: string) {
      field?.setAttribute('aria-invalid', String(Boolean(message)));
      field?.classList.toggle('input-error', Boolean(message));
      const hint = document.getElementById(id);
      if (hint) hint.textContent = message;
    }
    function validate(focus = false) {
      const templateText = waTemplate?.value
        ? waTemplate.selectedOptions[0]?.getAttribute('data-message')?.trim()
        : '';
      const hasText = Boolean(waMensagem?.value.trim() || templateText);
      const hasMedia = Boolean(tipoInput?.value);
      const mediaUrl = hasMedia ? urlInput?.value.trim() : '';
      const messageError =
        !hasText && !hasMedia
          ? 'Digite uma mensagem ou adicione um anexo.'
          : '';
      let mediaError = '';
      if (hasMedia) {
        if (!mediaUrl) mediaError = 'Informe o link do anexo selecionado.';
        else if (!urlInput.checkValidity() || !/^https?:\/\//i.test(mediaUrl))
          mediaError = 'Use um link completo com https:// ou http://.';
      }
      setFieldError(waMensagem, 'wa-message-error', messageError);
      setFieldError(urlInput, 'wa-media-error', mediaError);
      const error = messageError || mediaError;
      if (focus && error) (messageError ? waMensagem : urlInput)?.focus();
      return !error;
    }
    waForm.addEventListener('submit', (event) => {
      attempted = true;
      if (!validate(true)) {
        event.preventDefault();
        const button = event.submitter as HTMLButtonElement;
        if (button?.dataset.prevText !== undefined) {
          button.innerHTML = button.dataset.prevText;
          delete button.dataset.prevText;
          delete button.dataset.submitting;
          button.classList.remove('is-submitting');
          button.style.pointerEvents = '';
        }
      }
    });
    waForm.addEventListener('input', () => {
      if (attempted) validate();
    });
    waForm.addEventListener('change', () => {
      if (attempted) validate();
    });
    waForm.addEventListener('reset', () => {
      attempted = false;
      setFieldError(waMensagem, 'wa-message-error', '');
      setFieldError(urlInput, 'wa-media-error', '');
    });
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
            urlInput.disabled = true;
          }
        } else {
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
          if (tipoInput)
            tipoInput.value = b.getAttribute('data-wa-media') || '';
          if (urlInput) {
            urlInput.hidden = false;
            urlInput.disabled = false;
            urlInput.focus();
          }
        }
        if (attempted) validate();
      });
    });
  }
};
