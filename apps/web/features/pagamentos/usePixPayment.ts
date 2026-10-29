'use client';
import { useEffect, useRef, useState } from 'react';
import { safeCheckoutUrl } from '../../../../src/shared/paymentCheckout.ts';

export function usePixPayment(initial = null) {
  const [payment, setPayment] = useState(initial);
  const [phase, setPhase] = useState(
    initial?.qrText || initial?.checkoutUrl ? 'ready' : 'idle',
  );
  const [message, setMessage] = useState(
    initial?.qrText || initial?.checkoutUrl ? 'Aguardando pagamento.' : '',
  );
  const [copied, setCopied] = useState(false);
  const pending = useRef(false),
    alive = useRef(false),
    action = useRef(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      action.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (
      !['ready', 'pending'].includes(phase) ||
      !payment?.id ||
      !payment?.basePath
    )
      return;
    const controller = new AbortController();
    let timer;
    async function check() {
      try {
        if (!document.hidden) {
          const response = await fetch(
            `${payment.basePath}/status/${encodeURIComponent(payment.id)}`,
            {
              cache: 'no-store',
              headers: { Accept: 'application/json' },
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(15000),
              ]),
            },
          );
          const data = await response.json();
          if (!response.ok || !data.ok) throw new Error();
          if (controller.signal.aborted) return;
          if (data.status === 'approved') {
            setPhase('approved');
            setMessage(
              '✓ PIX pago! O responsável recebeu o aviso e fará a renovação do seu acesso.',
            );
            return;
          }
          if (['cancelled', 'rejected'].includes(data.status)) {
            setPayment(null);
            setPhase('idle');
            setMessage('PIX cancelado ou recusado. Gere um novo código.');
            return;
          }
          setMessage('Aguardando pagamento.');
        }
      } catch {
        if (!controller.signal.aborted)
          setMessage(
            'Não foi possível consultar o pagamento. Tentaremos novamente.',
          );
      }
      if (!controller.signal.aborted) timer = setTimeout(check, 5000);
    }
    timer = setTimeout(check, 5000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [payment, phase]);
  async function generate(create) {
    if (pending.current || ['pending', 'approved'].includes(phase)) return;
    pending.current = true;
    setPhase('busy');
    setMessage('Gerando PIX…');
    setCopied(false);
    action.current = new AbortController();
    try {
      const result = await create(
        AbortSignal.any([action.current.signal, AbortSignal.timeout(30000)]),
      );
      if (alive.current) {
        setPayment(result);
        setPhase('pending');
        setMessage('Aguardando pagamento.');
      }
    } catch (error) {
      if (alive.current) {
        setPhase('idle');
        setMessage(
          error.name === 'TimeoutError'
            ? 'A solicitação demorou demais. Confira sua conexão e tente novamente.'
            : error instanceof SyntaxError || error instanceof TypeError
              ? 'Não foi possível gerar o PIX. Confira sua conexão e tente novamente.'
              : error.message ||
                'Não foi possível gerar o PIX. Tente novamente.',
        );
      }
    } finally {
      pending.current = false;
    }
  }
  function reset() {
    if (!pending.current) {
      setPayment(null);
      setPhase('idle');
      setMessage('');
      setCopied(false);
    }
  }
  async function copy(element) {
    try {
      await navigator.clipboard.writeText(payment.qrText);
      if (alive.current) setCopied(true);
    } catch {
      element?.focus();
      element?.select();
      if (alive.current) setMessage('Selecione e copie o código acima.');
    }
  }
  return {
    payment,
    phase,
    message,
    copied,
    generate,
    reset,
    copy,
    reveal: () => setPhase('pending'),
    locked: ['busy', 'pending', 'approved'].includes(phase),
  };
}

export async function createPix(basePath, selection, signal) {
  const fallback = 'Não foi possível gerar o PIX. Tente novamente.';
  let response;
  try {
    response = await fetch(basePath + '/criar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(selection),
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw new Error(
      'Não foi possível conectar. Confira sua conexão e tente novamente.',
    );
  }
  let result;
  try {
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error();
    result = await response.json();
  } catch {
    if (signal?.aborted) throw signal.reason;
    throw new Error(fallback);
  }
  if (!response.ok || result?.ok !== true)
    throw new Error(
      typeof result?.error === 'string' && result.error
        ? result.error
        : fallback,
    );
  if (
    (!(typeof result.qrText === 'string' && result.qrText.trim()) &&
      !safeCheckoutUrl(result.checkoutUrl)) ||
    !Number.isSafeInteger(Number(result.pagamentoId)) ||
    Number(result.pagamentoId) <= 0
  )
    throw new Error(fallback);
  return {
    basePath,
    id: result.pagamentoId,
    qrText: result.qrText,
    qrBase64: result.qrBase64 || '',
    ...(safeCheckoutUrl(result.checkoutUrl)
      ? { checkoutUrl: safeCheckoutUrl(result.checkoutUrl) }
      : {}),
  };
}
