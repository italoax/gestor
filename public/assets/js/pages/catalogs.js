window.gestorPageModules = window.gestorPageModules || {};
window.gestorPageModules.initCatalogs = function ({
  setIconLabel,
  setModalState,
}) {
  document.querySelectorAll('.edit-plano').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-plano');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-plano-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_plano';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="tipo"]').value = /m[eê]s/i.test(
        btn.getAttribute('data-tipo') || '',
      )
        ? 'Meses'
        : 'Dias';
      form.querySelector('[name="periodo"]').value =
        btn.getAttribute('data-periodo') || '1';
      form.querySelector('[name="observacao"]').value =
        btn.getAttribute('data-observacao') || '';
      const pCred = form.querySelector('[name="creditos"]');
      if (pCred) pCred.value = btn.getAttribute('data-creditos') || '0';
      const pAtivo = form.querySelector('[name="ativo"]');
      if (pAtivo) pAtivo.checked = btn.getAttribute('data-ativo') !== '0';
      const pSigPkg = form.querySelector('[name="sigma_package_id"]');
      if (pSigPkg)
        pSigPkg.value = btn.getAttribute('data-sigma-package-id') || '';
      const pSigConn = form.querySelector('[name="sigma_connections"]');
      if (pSigConn)
        pSigConn.value = btn.getAttribute('data-sigma-connections') || '1';
      const pTitulo = modal.querySelector('.modal-header h3');
      if (pTitulo) setIconLabel(pTitulo, 'edit', 'Editar Plano');
      const pBtnEd = document.querySelector(
        'button[type="submit"][form="modal-add-plano-form"]',
      );
      if (pBtnEd) pBtnEd.textContent = 'Salvar';
      const pInfoUpd = form.querySelector('[name="periodo"]');
      if (pInfoUpd)
        pInfoUpd.dispatchEvent(new Event('input', { bubbles: true }));
      setModalState(modal, true);
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-plano"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-plano-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_plano';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
          form
            .querySelector('[name="periodo"]')
            .dispatchEvent(new Event('input', { bubbles: true }));
        }
        const t = document.querySelector('#modal-add-plano .modal-header h3');
        if (t) setIconLabel(t, 'plus', 'Novo Plano');
        const pBtnNv = document.querySelector(
          'button[type="submit"][form="modal-add-plano-form"]',
        );
        if (pBtnNv) pBtnNv.textContent = 'Cadastrar';
      });
    });

  document.querySelectorAll('.edit-dispositivo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-dispositivo');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-dispositivo-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_dispositivo';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="descricao"]').value =
        btn.getAttribute('data-descricao') || '';
      const dStatus = form.querySelector('[name="status"]');
      if (dStatus) dStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const dTit = modal.querySelector('.modal-header h3');
      if (dTit) setIconLabel(dTit, 'edit', 'Editar Dispositivo');
      setModalState(modal, true);
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-dispositivo"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-dispositivo-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_dispositivo';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const t = document.querySelector(
          '#modal-add-dispositivo .modal-header h3',
        );
        if (t) setIconLabel(t, 'plus', 'Novo Dispositivo');
      });
    });

  document.querySelectorAll('.edit-aplicativo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-aplicativo');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-aplicativo-form');
      if (!form) return;
      form.querySelector('[name="action"]').value = 'update_aplicativo';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="descricao"]').value =
        btn.getAttribute('data-descricao') || '';
      const aVal = form.querySelector('[name="valor_renovacao"]');
      if (aVal) aVal.value = btn.getAttribute('data-valor') || '';
      const aStatus = form.querySelector('[name="status"]');
      if (aStatus) aStatus.value = btn.getAttribute('data-status') || 'Ativo';
      const aTit = modal.querySelector('.modal-header h3');
      if (aTit) setIconLabel(aTit, 'edit', 'Editar Aplicativo');
      setModalState(modal, true);
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-aplicativo"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-aplicativo-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_aplicativo';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const t = document.querySelector(
          '#modal-add-aplicativo .modal-header h3',
        );
        if (t) setIconLabel(t, 'plus', 'Novo Aplicativo');
      });
    });

  document.querySelectorAll('.edit-servidor').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById('modal-add-servidor');
      if (!modal) return;
      const form = modal.querySelector('#modal-add-servidor-form');
      if (!form) return;
      // Preenche so os campos que ainda existem no form (nome, identificador,
      // creditos, valor, obs). Campos legados foram removidos da UI mas o
      // schema continua com as colunas — backend grava NULL/0 por default.
      form.querySelector('[name="action"]').value = 'update_servidor';
      form.querySelector('[name="id"]').value =
        btn.getAttribute('data-id') || '';
      form.querySelector('[name="nome"]').value =
        btn.getAttribute('data-nome') || '';
      form.querySelector('[name="creditos"]').value =
        btn.getAttribute('data-creditos') || '0';
      form.querySelector('[name="valor_cred"]').value =
        btn.getAttribute('data-valor') || '0';
      const setIfExists = (name, val) => {
        const el = form.querySelector('[name="' + name + '"]');
        if (el) el.value = val || '';
      };
      setIfExists('identificador', btn.getAttribute('data-identificador'));
      setIfExists('observacao_servidor', btn.getAttribute('data-obs'));
      const stitulo = modal.querySelector('.modal-header h3');
      if (stitulo) setIconLabel(stitulo, 'edit', 'Editar Servidor');
      const sBtnEd = document.querySelector(
        'button[type="submit"][form="modal-add-servidor-form"]',
      );
      if (sBtnEd) sBtnEd.textContent = 'Salvar';
      setModalState(modal, true);
      if (btn.hasAttribute('data-credit-focus')) {
        if (stitulo) setIconLabel(stitulo, 'money', 'Ajustar saldo');
        const creditos = form.querySelector('[name="creditos"]');
        creditos.focus({ preventScroll: true });
        creditos.select();
      }
    });
  });

  document
    .querySelectorAll('[data-open-modal="modal-add-servidor"]')
    .forEach((btn) => {
      btn.addEventListener('click', () => {
        const form = document.getElementById('modal-add-servidor-form');
        if (form) {
          form.reset();
          const a = form.querySelector('[name="action"]');
          if (a) a.value = 'create_servidor';
          const i = form.querySelector('[name="id"]');
          if (i) i.value = '';
        }
        const t = document.querySelector(
          '#modal-add-servidor .modal-header h3',
        );
        if (t) setIconLabel(t, 'plus', 'Novo Servidor');
        const sBtnNv = document.querySelector(
          'button[type="submit"][form="modal-add-servidor-form"]',
        );
        if (sBtnNv) sBtnNv.textContent = 'Cadastrar';
      });
    });

  document.querySelectorAll('form.delete-servidor').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!confirm('Deseja apagar este servidor?')) {
        e.preventDefault();
      }
    });
  });
};
