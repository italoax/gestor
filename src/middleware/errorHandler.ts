export function createErrorHandler(nodeEnv) {
  return (err, _req, res, _next) => {
    // O erro completo (com stack e mensagem crua do banco/integração) SEMPRE vai
    // pro log do servidor — é lá que se diagnostica.
    console.error(err);
    if (res.headersSent) return _next(err);
    // Pro usuário: em produção, mensagem genérica. Mostrar a mensagem crua vazava
    // detalhes internos (nome de tabela/coluna num erro de MySQL, path de arquivo,
    // etc.). Em desenvolvimento, mostra tudo pra facilitar o debug local.
    const payload =
      nodeEnv === 'development'
        ? err
        : {
            message:
              'Ocorreu um erro ao processar sua solicitação. Recarregue a página e tente de novo; se persistir, entre em contato com o suporte.',
          };
    if (_req.get('accept')?.includes('application/json')) {
      return res
        .status(500)
        .json({ ok: false, error: payload?.message || 'Erro interno.' });
    }
    res.status(500).render('pages/error', { title: 'Erro', error: payload });
  };
}
