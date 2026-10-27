import { confirmFormSubmission } from '../ui/panel-feedback.js';
window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initCatalogs = function ({ setModalState }) {
  (document.querySelectorAll('.edit-plano') as NodeListOf<HTMLElement>).forEach(
    (btn) => {
      btn.addEventListener('click', () => {
        const modal = document.getElementById('modal-add-plano') as HTMLElement;
        if (!modal) return;
        const form = modal.querySelector(
          '#modal-add-plano-form',
        ) as HTMLFormElement;
        if (!form) return;
        (form.querySelector('[name="action"]') as HTMLInputElement).value =
          'update_plano';
        (form.querySelector('[name="id"]') as HTMLInputElement).value =
          btn.getAttribute('data-id') || '';
        (form.querySelector('[name="nome"]') as HTMLInputElement).value =
          btn.getAttribute('data-nome') || '';
        (form.querySelector('[name="tipo"]') as HTMLInputElement).value =
          /m[eê]s/i.test(btn.getAttribute('data-tipo') || '')
            ? 'Meses'
            : 'Dias';
        (form.querySelector('[name="periodo"]') as HTMLInputElement).value =
          btn.getAttribute('data-periodo') || '1';
        (form.querySelector('[name="observacao"]') as HTMLInputElement).value =
          btn.getAttribute('data-observacao') || '';
        const pCred = form.querySelector(
          '[name="creditos"]',
        ) as HTMLInputElement;
        if (pCred) pCred.value = btn.getAttribute('data-creditos') || '0';
        const pAtivo = form.querySelector('[name="ativo"]') as HTMLInputElement;
        if (pAtivo) pAtivo.checked = btn.getAttribute('data-ativo') !== '0';
        const pSigPkg = form.querySelector(
          '[name="sigma_package_id"]',
        ) as HTMLInputElement;
        if (pSigPkg)
          pSigPkg.value = btn.getAttribute('data-sigma-package-id') || '';
        const pSigConn = form.querySelector(
          '[name="sigma_connections"]',
        ) as HTMLInputElement;
        if (pSigConn)
          pSigConn.value = btn.getAttribute('data-sigma-connections') || '1';
        const pTitulo = modal.querySelector('.modal-header h3') as HTMLElement;
        if (pTitulo) pTitulo.textContent = 'Editar plano';
        const pBtnEd = document.querySelector(
          'button[type="submit"][form="modal-add-plano-form"]',
        ) as HTMLButtonElement;
        if (pBtnEd) pBtnEd.textContent = 'Salvar';
        const pInfoUpd = form.querySelector('[name="periodo"]') as HTMLElement;
        if (pInfoUpd)
          pInfoUpd.dispatchEvent(new Event('input', { bubbles: true }));
        setModalState(modal, true);
      });
    },
  );

  (
    document.querySelectorAll(
      '[data-open-modal="modal-add-plano"]',
    ) as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(
        'modal-add-plano-form',
      ) as HTMLFormElement;
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]') as HTMLInputElement;
        if (a) a.value = 'create_plano';
        const i = form.querySelector('[name="id"]') as HTMLInputElement;
        if (i) i.value = '';
        (form.querySelector('[name="periodo"]') as HTMLElement).dispatchEvent(
          new Event('input', { bubbles: true }),
        );
      }
      const t = document.querySelector(
        '#modal-add-plano .modal-header h3',
      ) as HTMLElement;
      if (t) t.textContent = 'Novo plano';
      const pBtnNv = document.querySelector(
        'button[type="submit"][form="modal-add-plano-form"]',
      ) as HTMLButtonElement;
      if (pBtnNv) pBtnNv.textContent = 'Cadastrar';
    });
  });

  (
    document.querySelectorAll('.edit-dispositivo') as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-add-dispositivo',
      ) as HTMLElement;
      if (!modal) return;
      const form = modal.querySelector(
        '#modal-add-dispositivo-form',
      ) as HTMLFormElement;
      if (!form) return;
      (form.querySelector('[name="action"]') as HTMLInputElement).value =
        'update_dispositivo';
      (form.querySelector('[name="id"]') as HTMLInputElement).value =
        btn.getAttribute('data-id') || '';
      (form.querySelector('[name="nome"]') as HTMLInputElement).value =
        btn.getAttribute('data-nome') || '';
      (form.querySelector('[name="descricao"]') as HTMLInputElement).value =
        btn.getAttribute('data-descricao') || '';
      const dStatus = form.querySelector('[name="status"]') as HTMLInputElement;
      if (dStatus) dStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const dTit = modal.querySelector('.modal-header h3') as HTMLElement;
      if (dTit) dTit.textContent = 'Editar dispositivo';
      const submit = modal.querySelector(
        'button[form="modal-add-dispositivo-form"]',
      );
      if (submit) submit.textContent = 'Salvar';
      setModalState(modal, true);
    });
  });

  (
    document.querySelectorAll(
      '[data-open-modal="modal-add-dispositivo"]',
    ) as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(
        'modal-add-dispositivo-form',
      ) as HTMLFormElement;
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]') as HTMLInputElement;
        if (a) a.value = 'create_dispositivo';
        const i = form.querySelector('[name="id"]') as HTMLInputElement;
        if (i) i.value = '';
      }
      const t = document.querySelector(
        '#modal-add-dispositivo .modal-header h3',
      ) as HTMLElement;
      if (t) t.textContent = 'Novo dispositivo';
      const submit = document.querySelector(
        '#modal-add-dispositivo button[form="modal-add-dispositivo-form"]',
      );
      if (submit) submit.textContent = 'Cadastrar';
    });
  });

  (
    document.querySelectorAll('.edit-aplicativo') as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-add-aplicativo',
      ) as HTMLElement;
      if (!modal) return;
      const form = modal.querySelector(
        '#modal-add-aplicativo-form',
      ) as HTMLFormElement;
      if (!form) return;
      (form.querySelector('[name="action"]') as HTMLInputElement).value =
        'update_aplicativo';
      (form.querySelector('[name="id"]') as HTMLInputElement).value =
        btn.getAttribute('data-id') || '';
      (form.querySelector('[name="nome"]') as HTMLInputElement).value =
        btn.getAttribute('data-nome') || '';
      (form.querySelector('[name="descricao"]') as HTMLInputElement).value =
        btn.getAttribute('data-descricao') || '';
      const aVal = form.querySelector(
        '[name="valor_renovacao"]',
      ) as HTMLInputElement;
      if (aVal) aVal.value = btn.getAttribute('data-valor') || '';
      const aStatus = form.querySelector('[name="status"]') as HTMLInputElement;
      if (aStatus) aStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const aTit = modal.querySelector('.modal-header h3') as HTMLElement;
      if (aTit) aTit.textContent = 'Editar aplicativo';
      setModalState(modal, true);
    });
  });

  (
    document.querySelectorAll(
      '[data-open-modal="modal-add-aplicativo"]',
    ) as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(
        'modal-add-aplicativo-form',
      ) as HTMLFormElement;
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]') as HTMLInputElement;
        if (a) a.value = 'create_aplicativo';
        const i = form.querySelector('[name="id"]') as HTMLInputElement;
        if (i) i.value = '';
      }
      const t = document.querySelector(
        '#modal-add-aplicativo .modal-header h3',
      ) as HTMLElement;
      if (t) t.textContent = 'Novo aplicativo';
    });
  });

  (
    document.querySelectorAll('.edit-servidor') as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(
        'modal-add-servidor',
      ) as HTMLElement;
      if (!modal) return;
      const form = modal.querySelector(
        '#modal-add-servidor-form',
      ) as HTMLFormElement;
      if (!form) return;
      // Preenche so os campos que ainda existem no form (nome, identificador,
      // creditos, valor, obs). Campos legados foram removidos da UI mas o
      // schema continua com as colunas — backend grava NULL/0 por default.
      (form.querySelector('[name="action"]') as HTMLInputElement).value =
        'update_servidor';
      (form.querySelector('[name="id"]') as HTMLInputElement).value =
        btn.getAttribute('data-id') || '';
      (form.querySelector('[name="nome"]') as HTMLInputElement).value =
        btn.getAttribute('data-nome') || '';
      (form.querySelector('[name="creditos"]') as HTMLInputElement).value =
        btn.getAttribute('data-creditos') || '0';
      (form.querySelector('[name="valor_cred"]') as HTMLInputElement).value =
        btn.getAttribute('data-valor') || '0';
      const setIfExists = (name, val) => {
        const el = form.querySelector(
          '[name="' + name + '"]',
        ) as HTMLInputElement;
        if (el) el.value = val || '';
      };
      setIfExists('identificador', btn.getAttribute('data-identificador'));
      setIfExists('observacao_servidor', btn.getAttribute('data-obs'));
      const stitulo = modal.querySelector('.modal-header h3') as HTMLElement;
      if (stitulo) stitulo.textContent = 'Editar servidor';
      const sBtnEd = document.querySelector(
        'button[type="submit"][form="modal-add-servidor-form"]',
      ) as HTMLButtonElement;
      if (sBtnEd) sBtnEd.textContent = 'Salvar';
      setModalState(modal, true);
    });
  });

  (
    document.querySelectorAll(
      '[data-open-modal="modal-add-servidor"]',
    ) as NodeListOf<HTMLElement>
  ).forEach((btn) => {
    btn.addEventListener('click', () => {
      const form = document.getElementById(
        'modal-add-servidor-form',
      ) as HTMLFormElement;
      if (form) {
        form.reset();
        const a = form.querySelector('[name="action"]') as HTMLInputElement;
        if (a) a.value = 'create_servidor';
        const i = form.querySelector('[name="id"]') as HTMLInputElement;
        if (i) i.value = '';
      }
      const t = document.querySelector(
        '#modal-add-servidor .modal-header h3',
      ) as HTMLElement;
      if (t) t.textContent = 'Novo servidor';
      const sBtnNv = document.querySelector(
        'button[type="submit"][form="modal-add-servidor-form"]',
      ) as HTMLButtonElement;
      if (sBtnNv) sBtnNv.textContent = 'Cadastrar';
    });
  });

  (
    document.querySelectorAll(
      'form.delete-servidor',
    ) as NodeListOf<HTMLFormElement>
  ).forEach((form) => {
    form.addEventListener('submit', (e) => {
      confirmFormSubmission(e, 'Deseja apagar este servidor?');
    });
  });
};
