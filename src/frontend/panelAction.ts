export interface PanelActionResult {
  ok: boolean;
  redirect?: string;
  success: string[];
  errors: string[];
}

export async function postPanelAction(
  url: string,
  body: FormData | URLSearchParams,
  { csrfToken = '', signal }: { csrfToken?: string; signal?: AbortSignal } = {},
): Promise<PanelActionResult> {
  const response = await fetch(url, {
    method: 'POST',
    body,
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    signal,
    headers: {
      Accept: 'text/html',
      'x-gestor-action': '1',
      'x-csrf-token': csrfToken || String(body.get('_csrf') || ''),
    },
  });
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error(
      'Resposta inesperada. Confira os dados antes de enviar novamente.',
    );
  const data = await response.json();
  const strings = (values: unknown) =>
    Array.isArray(values)
      ? values.filter((value): value is string => typeof value === 'string')
      : [];
  const errors = strings(data.errors);
  if (typeof data.error === 'string') errors.push(data.error);
  if (!response.ok || data.ok !== true) {
    if (!errors.length)
      errors.push(
        'Não foi possível salvar. Confira os dados e tente novamente.',
      );
    return { ok: false, redirect: data.redirect, success: [], errors };
  }
  return {
    ok: true,
    redirect: data.redirect,
    success: strings(data.success),
    errors,
  };
}
