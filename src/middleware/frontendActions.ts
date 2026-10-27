// Mantém as validações, autorização e transações dos POSTs existentes.
// O cliente Next recebe o destino sem seguir o redirect e consumir os flashes
// em um documento HTML que nunca será exibido.
export function exposeFrontendAction(req, res, next) {
  if (req.method !== 'POST' || req.get('x-gestor-action') !== '1')
    return next();
  res.set('Cache-Control', 'private, no-store');
  // O encerramento de sessões destrói req.session antes de redirecionar.
  const notices = () =>
    req.session
      ? {
          success: [...req.flash('success'), ...req.flash('modal-success')],
          errors: [...req.flash('error'), ...req.flash('modal-error')],
        }
      : { success: [], errors: [] };
  res.redirect = (statusOrPath, path) => {
    const messages = notices();
    return res
      .status(200)
      .type('application/json')
      .json({
        ok: messages.success.length > 0 || messages.errors.length === 0,
        redirect: path ?? statusOrPath,
        ...messages,
      });
  };
  const render = res.render.bind(res);
  res.render = (view, options, callback) => {
    if (callback || typeof options === 'function')
      return render(view, options, callback);
    const error = options?.erro || options?.error?.message;
    return res.status(res.statusCode >= 400 ? res.statusCode : 422).json({
      ok: false,
      error:
        error || 'Não foi possível salvar. Confira os dados e tente novamente.',
    });
  };
  next();
}
