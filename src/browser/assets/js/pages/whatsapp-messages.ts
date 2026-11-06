import {
  MAX_MESSAGE_ATTACHMENT_SIZE,
  messageAttachmentAccept,
  messageAttachmentFormat,
} from '../../../../shared/messageAttachments.ts';

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

  // Seleciona o tipo de anexo e abre o upload do arquivo.
  const waForm = document.getElementById(
    'modal-send-whatsapp-form',
  ) as HTMLFormElement;
  if (waForm) {
    const fileInput = waForm.querySelector(
      '.wa-media-file',
    ) as HTMLInputElement;
    const mediaHint = waForm.querySelector('#wa-media-hint') as HTMLElement;
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
      const file = hasMedia ? fileInput?.files?.[0] : undefined;
      const messageError =
        !hasText && !hasMedia
          ? 'Digite uma mensagem ou adicione um anexo.'
          : '';
      let mediaError = '';
      if (hasMedia) {
        if (!file) mediaError = 'Selecione o arquivo do anexo.';
        else if (!file.size)
          mediaError = 'O arquivo está vazio. Selecione outro anexo.';
        else if (file.size > MAX_MESSAGE_ATTACHMENT_SIZE)
          mediaError = 'Arquivo muito grande (máx. 5 MB).';
        else if (
          messageAttachmentFormat(file.type, file.name)?.type !==
          tipoInput.value
        )
          mediaError =
            'O arquivo não corresponde ao tipo de anexo selecionado.';
      }
      setFieldError(waMensagem, 'wa-message-error', messageError);
      setFieldError(fileInput, 'wa-media-error', mediaError);
      const error = messageError || mediaError;
      if (focus && error) (messageError ? waMensagem : fileInput)?.focus();
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
      setFieldError(fileInput, 'wa-media-error', '');
      tipoInput.value = '';
      fileInput.value = '';
      fileInput.hidden = true;
      fileInput.disabled = true;
      if (mediaHint) mediaHint.hidden = true;
      waForm.querySelectorAll('[data-wa-media]').forEach((button) => {
        button.classList.remove('active');
        button.setAttribute('aria-pressed', 'false');
      });
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
          if (fileInput) {
            fileInput.value = '';
            fileInput.hidden = true;
            fileInput.disabled = true;
          }
          if (mediaHint) mediaHint.hidden = true;
        } else {
          b.classList.add('active');
          b.setAttribute('aria-pressed', 'true');
          if (tipoInput)
            tipoInput.value = b.getAttribute('data-wa-media') || '';
          if (fileInput) {
            fileInput.value = '';
            fileInput.accept = messageAttachmentAccept(tipoInput.value);
            fileInput.hidden = false;
            fileInput.disabled = false;
            fileInput.click();
          }
          if (mediaHint) mediaHint.hidden = false;
        }
        if (attempted) validate();
      });
    });
  }
};
