import crypto from 'node:crypto';
import { notifyPortalAccessChanged } from '../services/portalSessionStream.ts';
import { revealIptvPassword } from '../security/storedSecrets.ts';
import { startSessionSecurity } from '../services/sessionSecurity.ts';
import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
export function createPortalWorkflow({
  execute,
  queryOne,
  queryRows,
  escolherProvedor,
  caminhoPagamento,
  escolhasRenovacao,
  lerPlanoAdicional,
}) {
  const revision = (cliente) =>
    crypto
      .createHash('sha256')
      .update(
        JSON.stringify([
          cliente.user,
          revealIptvPassword(cliente.senha, cliente.user_id),
          cliente.pagamento_curto || null,
        ]),
      )
      .digest('hex');
  const sameSecret = (a, b) =>
    crypto.timingSafeEqual(
      crypto.createHash('sha256').update(a).digest(),
      crypto.createHash('sha256').update(b).digest(),
    );
  const fields =
    'id, user_id, nome, user, vencimento, hora_vencimento, plano, valor, telas, servidor, sigma_customer_id, plano_adicional, status, aplicativo, senha, pagamento_token, pagamento_curto';
  return {
    loginPage: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const alias = String(input.query.acesso ?? '');
          const cliente = /^[A-Za-z0-9_-]{16}$/.test(alias)
            ? await queryOne(
                'SELECT id, user_id, user, senha, pagamento_curto FROM clientes WHERE pagamento_curto = :alias AND arquivado = 0 AND portal_bloqueado = 0 LIMIT 1',
                { alias },
              )
            : null;
          if (cliente) {
            await new Promise<void>((resolve, reject) =>
              input.session.regenerate((err) =>
                err ? reject(err) : resolve(),
              ),
            );
            input.session.cliente = {
              id: cliente.id,
              revision: revision(cliente),
              viaLink: true,
            };
            input.session.cookie.maxAge = 8 * 60 * 60 * 1000;
            input.session.security = startSessionSecurity();
            await new Promise<void>((resolve, reject) =>
              input.session.save((err) => (err ? reject(err) : resolve())),
            );
            return reply.redirect('/area-cliente');
          }
          if (alias)
            return reply.status(401).render('pages/area-cliente', {
              layout: false,
              cliente: null,
              pix: false,
              erro: 'Link de acesso inválido ou indisponível. Entre com seus dados IPTV ou solicite um novo link.',
            });
          reply.render('pages/area-cliente', {
            layout: false,
            cliente: null,
            pix: false,
            loginValue: '',
            erro: input.flash('portal-error').join(' '),
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    login: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const login = String(input.body.login ?? '').trim();
          const password = String(input.body.password ?? '');
          const rejectLogin = (erro) => {
            if (input.get('Accept') === 'application/json')
              return reply.status(401).json({ ok: false, erro });
            return reply.status(401).render('pages/area-cliente', {
              layout: false,
              cliente: null,
              pix: false,
              loginValue: login,
              erro,
            });
          };
          if (!login) return rejectLogin('Informe seu usuário IPTV.');
          const candidates =
            login.length <= 120
              ? await queryRows(
                  'SELECT id, user_id, user, senha, pagamento_curto, arquivado, portal_bloqueado FROM clientes WHERE user = :login',
                  { login },
                )
              : [];
          const users = candidates.filter((c) => c.user === login);
          const enabled = users.filter(
            (c) => !c.arquivado && !c.portal_bloqueado,
          );
          if (!password) return rejectLogin('Informe sua senha IPTV.');
          const matches =
            password.length <= 190
              ? enabled.filter(
                  (c) =>
                    c.senha &&
                    sameSecret(
                      revealIptvPassword(c.senha, c.user_id),
                      password,
                    ),
                )
              : [];
          if (matches.length !== 1)
            return rejectLogin(
              'Usuário ou senha inválidos, ou acesso indisponível. Confira seus dados ou entre em contato com o responsável.',
            );
          const cliente = matches[0];
          await new Promise<void>((resolve, reject) =>
            input.session.regenerate((err) => (err ? reject(err) : resolve())),
          );
          input.session.cliente = {
            id: cliente.id,
            revision: revision(cliente),
          };
          input.session.cookie.maxAge = 8 * 60 * 60 * 1000;
          input.session.security = startSessionSecurity();
          await new Promise<void>((resolve, reject) =>
            input.session.save((err) => (err ? reject(err) : resolve())),
          );
          reply.redirect('/area-cliente');
        } catch (err) {
          raiseWorkflowError(err);
        }
      }),
    logout: (input) =>
      workflowResult(input, async (reply) => {
        await new Promise<void>((resolve, reject) =>
          input.session.destroy((error) => (error ? reject(error) : resolve())),
        );
        reply.redirect('/area-cliente/login');
      }),
    authorize: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const identity = input.session.cliente;
          if (!identity) return reply.redirect('/area-cliente/login');
          const cliente = await queryOne(
            `SELECT ${fields} FROM clientes WHERE id = :id AND arquivado = 0 AND portal_bloqueado = 0`,
            { id: identity.id },
          );
          const credencialValida = identity.viaLink
            ? Boolean(cliente?.pagamento_curto)
            : Boolean(cliente?.senha);
          if (
            !cliente ||
            !credencialValida ||
            revision(cliente) !== identity.revision
          ) {
            delete input.session.cliente;
            return reply.redirect('/');
          }
          reply.locals.portalCliente = cliente;
          raiseWorkflowError();
        } catch (err) {
          raiseWorkflowError(err);
        }
      }),
    home: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const cliente = reply.locals.portalCliente;
          const paymentProvider = await escolherProvedor(cliente.user_id);
          const pix = Boolean(paymentProvider);
          const escolhas = await escolhasRenovacao(cliente, (nome) =>
            queryOne(
              'SELECT periodo, tipo, credito_gastos AS creditoGastos FROM planos WHERE user_id = :userId AND nome = :nome LIMIT 1',
              { userId: cliente.user_id, nome },
            ),
          );
          reply.render('pages/area-cliente', {
            layout: false,
            cliente,
            adicional: lerPlanoAdicional(cliente.plano_adicional),
            pix,
            payerDetailsRequired: paymentProvider?.provider === 'picpay',
            escolhas,
            opcoesRenovacao: escolhas[0].opcoes,
            erro: input.flash('portal-error').join(' '),
          });
        } catch (err) {
          raiseWorkflowError(err);
        }
      }),
    renew: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const cliente = reply.locals.portalCliente;
          if (!(await escolherProvedor(cliente.user_id))) {
            input.flash(
              'portal-error',
              'O PIX ainda não foi configurado. Entre em contato com o responsável pelo seu cadastro.',
            );
            return reply.redirect('/area-cliente');
          }
          await execute(
            'UPDATE clientes SET pagamento_token = :token WHERE id = :id AND pagamento_token IS NULL',
            { id: cliente.id, token: crypto.randomBytes(16).toString('hex') },
          );
          const row = await queryOne(
            'SELECT pagamento_token FROM clientes WHERE id = :id',
            { id: cliente.id },
          );
          if (input.get('Accept') === 'application/json')
            return reply.json({
              pagamentoUrl: `/pagar/${encodeURIComponent(row.pagamento_token)}`,
            });
          const periodos = Number(input.body.periodos ?? 1);
          const selecao = ['ambos', 'principal', 'adicional'].includes(
            input.body.selecao,
          )
            ? input.body.selecao
            : '';
          const params = new URLSearchParams();
          if (Number.isSafeInteger(periodos) && periodos > 1)
            params.set('periodos', String(periodos));
          if (selecao) params.set('selecao', selecao);
          reply.redirect(
            caminhoPagamento(row.pagamento_token) +
              (params.size ? '?' + params.toString() : ''),
          );
        } catch (err) {
          raiseWorkflowError(err);
        }
      }),
    accesses: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const selectedId =
            input.query.cliente === undefined
              ? null
              : Number(input.query.cliente);
          if (
            selectedId !== null &&
            (!Number.isSafeInteger(selectedId) || selectedId <= 0)
          )
            return reply.sendStatus(400);
          const clientes = await queryRows(
            "SELECT id, nome, user, pagamento_curto, portal_bloqueado, (senha IS NOT NULL AND senha <> '') AS temSenha FROM clientes WHERE user_id = :owner AND arquivado = 0" +
              (selectedId !== null ? ' AND id = :selectedId' : '') +
              ' ORDER BY nome',
            { owner: input.session.user.id, selectedId },
          );
          if (selectedId !== null && !clientes.length)
            return reply.sendStatus(404);
          if (
            input.get('Accept') === 'application/json' &&
            selectedId !== null
          ) {
            const c = clientes[0];
            return reply.json({
              id: c.id,
              nome: c.nome,
              user: c.user,
              blocked: Boolean(c.portal_bloqueado),
              hasLink: Boolean(c.pagamento_curto),
            });
          }
          reply.render('pages/acessos-clientes', {
            title: 'Acessos dos clientes',
            clientes,
            aviso: input.flash('portal-admin').join(' '),
          });
        } catch (err) {
          raiseWorkflowError(err);
        }
      }),
    changeAccess: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const id = Number(input.body.id),
            owner = input.session.user.id;
          const cliente = await queryOne(
            'SELECT id FROM clientes WHERE id = :id AND user_id = :owner AND arquivado = 0',
            { id, owner },
          );
          if (!cliente) return reply.sendStatus(404);
          if (input.body.action === 'revoke-link') {
            await execute(
              'UPDATE clientes SET pagamento_curto = NULL WHERE id = :id AND user_id = :owner AND arquivado = 0',
              { id, owner },
            );
            notifyPortalAccessChanged(id);
            if (input.get('Accept') === 'application/json')
              return reply.json({
                ok: true,
                message:
                  'Link revogado. O próximo envio ou cópia gerará um novo link.',
              });
            input.flash(
              'portal-admin',
              'Link revogado. As sessões anteriores precisarão entrar novamente. Copie ou envie o link para gerar um novo.',
            );
            return reply.redirect(`/acessos-clientes?cliente=${id}`);
          }
          if (!['disable', 'enable'].includes(input.body.action))
            return reply.sendStatus(400);
          const blocked = input.body.action === 'disable' ? 1 : 0;
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await execute(
                'UPDATE clientes SET portal_bloqueado = :blocked, pagamento_curto = :alias WHERE id = :id AND user_id = :owner AND arquivado = 0',
                {
                  id,
                  owner,
                  blocked,
                  alias: blocked
                    ? null
                    : crypto.randomBytes(12).toString('base64url'),
                },
              );
              break;
            } catch (error) {
              if (error.code !== 'ER_DUP_ENTRY' || blocked || attempt === 2)
                throw error;
            }
          }
          const message = blocked
            ? 'Acesso desativado. O link anterior foi invalidado.'
            : 'Acesso habilitado com um novo link.';
          notifyPortalAccessChanged(id);
          if (input.get('Accept') === 'application/json')
            return reply.json({
              ok: true,
              message,
            });
          input.flash('portal-admin', message);
          reply.redirect(`/acessos-clientes?cliente=${id}`);
        } catch (err) {
          raiseWorkflowError(err);
        }
      }),
  };
}
