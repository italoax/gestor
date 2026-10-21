'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { isPanelPage } from '../../../../src/frontend/pageRoutes.ts';
import { postPanelAction } from '../../../../src/frontend/panelAction.ts';
import { PanelNotice } from '../ui/PanelNotice.tsx';
import {
  showPanelNotice,
  dismissPanelNotice,
} from '../../../../src/browser/assets/js/ui/panel-feedback.ts';

export function PanelInteractions({ path }: { path: string }) {
  const router = useRouter();
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
    pending?: boolean;
    form?: HTMLFormElement;
  }>();
  useEffect(() => {
    setNotice(undefined);
    dismissPanelNotice();
    return dismissPanelNotice;
  }, [path]);
  const showNotice = (notice: {
    text: string;
    error?: boolean;
    pending?: boolean;
    form?: HTMLFormElement;
  }) => {
    dismissPanelNotice();
    if (
      notice.form?.isConnected &&
      notice.form.closest('dialog[open], .modal-overlay.open')
    )
      setNotice(notice);
    else {
      setNotice(undefined);
      showPanelNotice(notice.text, notice.error, { pending: notice.pending });
    }
  };
  useEffect(() => {
    let active = true;
    let saving = false;
    let savingForm: HTMLFormElement | undefined;
    const navigate = async (href: string) => {
      const url = new URL(href, location.href);
      if (url.origin !== location.origin || !isPanelPage(url.pathname)) {
        location.assign(url.href);
        return false;
      }
      if (url.pathname + url.search === location.pathname + location.search)
        router.refresh();
      else router.push(url.pathname + url.search + url.hash, { scroll: false });
      return true;
    };
    const refresh = () => router.refresh();
    window.gestorNavigate = navigate;
    window.gestorRefresh = refresh;
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        'a[href]',
      );
      if (
        !link?.closest('[data-ajax-panel]') ||
        link.hasAttribute('download') ||
        link.hasAttribute('data-no-pjax') ||
        (link.target && link.target !== '_self')
      )
        return;
      const url = new URL(link.href, location.href);
      if (
        url.origin !== location.origin ||
        !isPanelPage(url.pathname) ||
        (url.hash &&
          url.pathname + url.search === location.pathname + location.search)
      )
        return;
      event.preventDefault();
      void navigate(url.href);
    }
    async function submit(event: SubmitEvent) {
      const form = event.target;
      if (
        event.defaultPrevented ||
        !(form instanceof HTMLFormElement) ||
        !form.closest('[data-ajax-panel]') ||
        form.hasAttribute('data-no-pjax')
      )
        return;
      const submitter = event.submitter as
        HTMLButtonElement | HTMLInputElement | null;
      const method = (
        submitter?.getAttribute('formmethod') ||
        form.getAttribute('method') ||
        'GET'
      ).toUpperCase();
      const target =
        submitter?.getAttribute('formtarget') || form.getAttribute('target');
      const url = new URL(
        submitter?.getAttribute('formaction') ||
          form.getAttribute('action') ||
          location.href,
        location.href,
      );
      if (
        (target && target !== '_self') ||
        url.origin !== location.origin ||
        !['GET', 'POST'].includes(method) ||
        url.pathname === '/logout'
      )
        return;
      if (method === 'GET' && !isPanelPage(url.pathname)) return;
      event.preventDefault();
      if (saving) {
        if (form !== savingForm)
          form.dispatchEvent(
            new CustomEvent('gestor:submit-finished', { bubbles: true }),
          );
        return;
      }
      const data = new FormData(form);
      if (submitter?.name) data.append(submitter.name, submitter.value);
      if (method === 'GET') {
        url.search = new URLSearchParams(
          Array.from(data, ([key, value]) => [key, String(value)]),
        ).toString();
        void navigate(url.href);
        return;
      }
      const enctype =
        submitter?.getAttribute('formenctype') || form.getAttribute('enctype');
      const body =
        enctype === 'multipart/form-data'
          ? data
          : new URLSearchParams(
              Array.from(data, ([key, value]) => [key, String(value)]),
            );
      const buttons = Array.from(form.elements).filter(
        (element): element is HTMLButtonElement | HTMLInputElement =>
          (element instanceof HTMLButtonElement ||
            element instanceof HTMLInputElement) &&
          element.type === 'submit',
      );
      const originals = buttons.map((button) => ({
        button,
        disabled: button.disabled,
      }));
      saving = true;
      savingForm = form;
      form.setAttribute('aria-busy', 'true');
      buttons.forEach((button) => {
        button.disabled = true;
      });
      showNotice({ text: 'Aguarde um instante.', pending: true });
      const originalUrl = location.href;
      try {
        const result = await postPanelAction(url.href, body);
        if (!active || originalUrl !== location.href) return;
        const destination = new URL(
          result.redirect || location.href,
          location.href,
        );
        if (destination.origin !== location.origin)
          throw new Error('Destino de atualização inválido.');
        if (destination.pathname === '/login') {
          router.replace('/login');
          return;
        }
        if (!result.ok) {
          showNotice({ text: result.errors.join(' '), error: true, form });
          return;
        }
        const modal = form.closest<HTMLElement>('.modal-overlay');
        if (modal) window.gestorSetModalState?.(modal, false);
        form.dispatchEvent(
          new CustomEvent('gestor:submit-success', { bubbles: true }),
        );
        showNotice({
          text:
            [...result.success, ...result.errors].join(' ') ||
            'Alterações salvas.',
          error: result.errors.length > 0,
        });
        // Redirects para a mesma tela não devem apagar filtros e paginação.
        if (destination.pathname === location.pathname) router.refresh();
        else if (isPanelPage(destination.pathname))
          router.push(destination.pathname + destination.search, {
            scroll: false,
          });
        else
          throw new Error(
            'Os dados foram enviados, mas não foi possível atualizar esta tela.',
          );
      } catch (error) {
        if (active && originalUrl === location.href)
          showNotice({
            text:
              error instanceof Error &&
              !(error instanceof TypeError) &&
              !(error instanceof SyntaxError)
                ? error.message
                : 'Não foi possível confirmar o salvamento. Confira os dados antes de enviar novamente.',
            error: true,
            form,
          });
      } finally {
        saving = false;
        savingForm = undefined;
        form.removeAttribute('aria-busy');
        originals.forEach(({ button, disabled }) => {
          button.disabled = disabled;
        });
        form.dispatchEvent(
          new CustomEvent('gestor:submit-finished', { bubbles: true }),
        );
      }
    }
    document.addEventListener('click', click);
    document.addEventListener('submit', submit);
    return () => {
      active = false;
      document.removeEventListener('click', click);
      document.removeEventListener('submit', submit);
      if (window.gestorNavigate === navigate) delete window.gestorNavigate;
      if (window.gestorRefresh === refresh) delete window.gestorRefresh;
    };
  }, [router, path]);
  if (!notice) return null;
  const inlineForm =
    notice.form?.isConnected &&
    notice.form.closest('dialog[open], .modal-overlay.open')
      ? notice.form
      : undefined;
  const message = (
    <PanelNotice
      text={notice.text}
      error={notice.error}
      pending={notice.pending}
      inline={Boolean(inlineForm)}
      onClose={() => setNotice(undefined)}
    />
  );
  return createPortal(message, inlineForm || document.body);
}
