import {
  confirmFormSubmission,
  showPanelNotice,
} from '../ui/panel-feedback.js';
window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initMessageTemplates = function ({
  setIconLabel,
  setModalState,
}) {
  (
    document.querySelectorAll('.edit-mensagem') as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-add-mensagem',
      ) as HTMLElement;
      if (!modal) return;
      const form = modal.querySelector(
        '#modal-add-mensagem-form',
      ) as HTMLFormElement;
      if (!form) return;
      (form.querySelector('[name="action"]') as HTMLInputElement).value =
        'update_mensagem';
      (form.querySelector('[name="id"]') as HTMLInputElement).value =
        btn.getAttribute('data-id') || '';
      (form.querySelector('[name="titulo"]') as HTMLInputElement).value =
        btn.getAttribute('data-titulo') || '';
      const desc = form.querySelector('[name="descricao"]') as HTMLInputElement;
      if (desc) desc.value = btn.getAttribute('data-descricao') || '';
      (form.querySelector('[name="mensagem"]') as HTMLInputElement).value =
        btn.getAttribute('data-mensagem') || '';
      (form.querySelector('[name="media_tipo"]') as HTMLInputElement).value =
        btn.getAttribute('data-media-tipo') || '';
      (form.querySelector('[name="media_path"]') as HTMLInputElement).value =
        btn.getAttribute('data-media-path') || '';
      const title = modal.querySelector('.modal-header h3') as HTMLElement;
      if (title) setIconLabel(title, 'edit', 'Editar Template');
      setModalState(modal, true);
    });
  });

  (
    document.querySelectorAll(
      'form.delete-mensagem',
    ) as NodeListOf<HTMLFormElement>
  ).forEach((form) => {
    form.addEventListener('submit', (e) => {
      confirmFormSubmission(e, 'Deseja apagar esta mensagem?');
    });
  });
};

window.gestorPageModules.initMessageTags = function ({ setModalState }) {
  const params = new URLSearchParams(window.location.search);
  let text = '';
  if (params.get('saved') === '1') text = 'Mensagem salva com sucesso.';
  if (params.get('updated') === '1') text = 'Mensagem atualizada com sucesso.';
  if (params.get('deleted') === '1') text = 'Mensagem apagada com sucesso.';
  if (text) {
    showPanelNotice(text);
    params.delete('saved');
    params.delete('updated');
    params.delete('deleted');
    const newUrl =
      window.location.pathname +
      (params.toString() ? '?' + params.toString() : '');
    window.history.replaceState({}, '', newUrl);
  }
};
