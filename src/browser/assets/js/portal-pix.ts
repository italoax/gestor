import { safeCheckoutUrl } from '../../../shared/paymentCheckout.ts';
(() => {
  const form = document.querySelector('[data-pix-form]') as HTMLFormElement;
  if (!form) return;
  const button = form.querySelector('button') as HTMLButtonElement;
  const details = document.querySelector('[data-pix-details]') as HTMLElement;
  const code = document.querySelector('[data-pix-code]') as HTMLInputElement;
  const status = document.querySelector('[data-pix-status]') as HTMLElement;
  let timer;
  const periodos = form.querySelector('[name="periodos"]') as HTMLSelectElement;
  const selecao = form.querySelector('[name="selecao"]') as HTMLSelectElement;
  if (selecao)
    selecao.addEventListener('change', () => {
      const opcoes = JSON.parse(selecao.selectedOptions[0].dataset.opcoes);
      periodos.replaceChildren(
        ...opcoes.map((opcao) => {
          const option = new Option(opcao.label, opcao.periodos);
          option.dataset.valor = opcao.valor;
          return option;
        }),
      );
      periodos.dispatchEvent(new Event('change'));
    });
  if (periodos)
    periodos.addEventListener('change', () => {
      const amount = document.querySelector(
        '.portal-renew-price',
      ) as HTMLElement;
      if (amount)
        amount.textContent = Number(
          periodos.selectedOptions[0].dataset.valor,
        ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    const quantidade = Number(periodos?.value || 1);
    const planos = selecao?.value;
    if (selecao) selecao.disabled = true;
    if (periodos) periodos.disabled = true;
    status.textContent = 'Gerando PIX…';
    try {
      const auth = await fetch(form.action, {
        method: 'POST',
        body: new URLSearchParams(
          Array.from(new FormData(form), ([key, value]) => [
            key,
            String(value),
          ]),
        ),
        headers: { Accept: 'application/json' },
      });
      if (
        !auth.ok ||
        !auth.headers.get('content-type')?.includes('application/json')
      )
        throw Error(
          'Recarregue a área do cliente e confira se o PIX está disponível.',
        );
      const { pagamentoUrl } = await auth.json();
      const response = await fetch(pagamentoUrl + '/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodos: quantidade,
          selecao: planos,
          payerName: (
            form.querySelector('[name=payerName]') as HTMLInputElement
          )?.value,
          payerEmail: (
            form.querySelector('[name=payerEmail]') as HTMLInputElement
          )?.value,
          payerDocument: (
            form.querySelector('[name=payerDocument]') as HTMLInputElement
          )?.value,
        }),
      });
      const result = await response.json();
      if (
        !response.ok ||
        !result.ok ||
        (!result.qrText && !safeCheckoutUrl(result.checkoutUrl))
      )
        throw Error(
          result.error || 'Não foi possível gerar o PIX. Tente novamente.',
        );
      code.value = result.qrText;
      const checkout = safeCheckoutUrl(result.checkoutUrl);
      if (checkout) {
        const link = document.createElement('a');
        link.href = checkout;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'portal-button';
        link.textContent = 'Pagar no checkout Stripe';
        details.prepend(link);
        const label = code.closest('label');
        if (label) label.hidden = true;
        const copy = details.querySelector('[data-pix-copy]') as HTMLElement;
        if (copy) copy.hidden = true;
      }
      details.hidden = false;
      button.hidden = true;
      status.textContent = 'Aguardando pagamento.';
      const check = async () => {
        try {
          const r = await fetch(
            pagamentoUrl + '/status/' + encodeURIComponent(result.pagamentoId),
            { cache: 'no-store' },
          );
          const data = await r.json();
          if (data.ok && data.status === 'approved') {
            details.hidden = true;
            status.textContent =
              '✓ PIX pago! O responsável recebeu o aviso e fará a renovação do seu acesso.';
            status.style.color = '#22c55e';
            status.style.fontWeight = '700';
            return;
          }
          if (data.ok && ['rejected', 'cancelled'].includes(data.status)) {
            details.hidden = true;
            button.hidden = false;
            if (periodos) periodos.disabled = false;
            if (selecao) selecao.disabled = false;
            status.textContent =
              'PIX cancelado ou recusado. Gere um novo código.';
            return;
          }
        } catch {
          /* Nova consulta sem gerar outra cobrança. */
        }
        timer = setTimeout(check, 5000);
      };
      clearTimeout(timer);
      timer = setTimeout(check, 5000);
    } catch (error) {
      if (periodos) periodos.disabled = false;
      if (selecao) selecao.disabled = false;
      status.textContent = error.message || 'Falha ao gerar PIX.';
    } finally {
      button.disabled = false;
    }
  });
  (document.querySelector('[data-pix-copy]') as HTMLElement).addEventListener(
    'click',
    async () => {
      try {
        await navigator.clipboard.writeText(code.value);
        status.textContent = 'Código PIX copiado!';
      } catch {
        code.focus();
        code.select();
        status.textContent = 'Selecione e copie o código acima.';
      }
    },
  );
  window.addEventListener('pagehide', () => clearTimeout(timer));
})();
