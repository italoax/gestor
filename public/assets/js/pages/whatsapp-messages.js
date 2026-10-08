window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initWhatsappMessages = function ({ setModalState }) {
  document.querySelectorAll('.open-whatsapp-message').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-send-whatsapp');
      if (!modal) return;
      const form = modal.querySelector('#modal-send-whatsapp-form');
      if (!form) return;
      form.reset();
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      const nome = btn.getAttribute('data-nome') || '';
      const tel = btn.getAttribute('data-telefone') || '';
      const nomeEl = modal.querySelector('[data-wa-nome]');
      if (nomeEl) nomeEl.textContent = nome || '—';
      const telEl = modal.querySelector('[data-wa-telefone]');
      if (telEl) telEl.textContent = tel;
      // reseta a mídia
      const mt = form.querySelector('[name="media_tipo"]');
      if (mt) mt.value = '';
      const murl = form.querySelector('.wa-media-url');
      if (murl) {
        murl.hidden = true;
        murl.value = '';
      }
      form
        .querySelectorAll('[data-wa-media]')
        .forEach((b) => b.classList.remove('active'));
      setModalState(modal, true);
    });
  });

  // Template (opcional) -> preenche o textarea da mensagem
  const waTemplate = document.querySelector(
    '#modal-send-whatsapp-form [data-wa-template]',
  );
  const waMensagem = document.querySelector(
    '#modal-send-whatsapp-form [data-wa-mensagem]',
  );
  if (waTemplate && waMensagem) {
    waTemplate.addEventListener('change', () => {
      const opt = waTemplate.options[waTemplate.selectedIndex];
      const msg = opt ? opt.getAttribute('data-message') || '' : '';
      if (msg) waMensagem.value = msg;
    });
  }

  // Botões de Anexar Mídia: define o tipo e mostra o campo de link
  const waForm = document.getElementById('modal-send-whatsapp-form');
  if (waForm) {
    const urlInput = waForm.querySelector('.wa-media-url');
    const tipoInput = waForm.querySelector('[name="media_tipo"]');
    waForm.querySelectorAll('[data-wa-media]').forEach((b) => {
      b.addEventListener('click', () => {
        const ativo = b.classList.contains('active');
        waForm
          .querySelectorAll('[data-wa-media]')
          .forEach((x) => x.classList.remove('active'));
        if (ativo) {
          if (tipoInput) tipoInput.value = '';
          if (urlInput) {
            urlInput.hidden = true;
          }
        } else {
          b.classList.add('active');
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
