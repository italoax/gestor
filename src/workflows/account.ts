import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
import {
  credentialRevision,
  hasRecentAuthentication,
} from '../services/sessionSecurity.ts';
export function createAccountWorkflow({
  bcrypt,
  execute,
  queryOne,
  queryRows,
  invalidarPixConfig,
  toNullableString,
  auditSecurity = async (..._args: any[]) => {},
}) {
  return {
    profile: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const user = await queryOne(
            `SELECT id, name, username, email,
              pix_chave AS pixChave, pix_nome AS pixNome, pix_tipo AS pixTipo
         FROM users WHERE id = :id LIMIT 1`,
            { id: input.session.user.id },
          );
          reply.render('pages/minha-conta', {
            title: 'Minha Conta',
            account: user,
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    savePix: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const id = input.session.user.id;
          const pixChave = toNullableString(input.body.pix_chave);
          const pixNome = toNullableString(input.body.pix_nome);
          const pixTipo = toNullableString(input.body.pix_tipo);
          if (
            pixChave &&
            ['celular', 'telefone', 'phone'].includes(
              String(pixTipo ?? '')
                .toLowerCase()
                .trim(),
            )
          ) {
            const digits = pixChave.replace(/\D/g, '');
            const international = digits.length === 11 ? `55${digits}` : digits;
            if (
              !/^[+\d().\s-]+$/.test(pixChave) ||
              !/^55\d{2}9\d{8}$/.test(international)
            ) {
              input.flash(
                'error',
                'A chave Pix de celular deve ter DDD e 9 dígitos, incluindo o 9 inicial. Copie a chave cadastrada no app do banco.',
              );
              return reply.redirect('/minha-conta');
            }
          }
          await execute(
            'UPDATE users SET pix_chave = :pixChave, pix_nome = :pixNome, pix_tipo = :pixTipo WHERE id = :id',
            { id, pixChave, pixNome, pixTipo },
          );
          invalidarPixConfig(id); // limpa o cache pra a mudanca valer na proxima mensagem
          await auditSecurity('credentials.changed', {
            userId: id,
            reason: 'pix',
          });
          input.flash(
            'success',
            'Chave PIX salva. Use a tag {pix} nas mensagens.',
          );
          return reply.redirect('/minha-conta');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    saveProfile: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const id = input.session.user.id;
          const name = String(input.body.name ?? '').trim();
          const password = String(input.body.password ?? '');
          const passwordConfirm = String(input.body.password_confirm ?? '');
          const account = await queryOne(
            'SELECT username, password_hash AS passwordHash, is_admin AS isAdmin, session_version AS sessionVersion FROM users WHERE id = :id LIMIT 1',
            { id },
          );
          if (!account) return reply.sendStatus(401);
          const username = account.username;
          if (
            input.body.username != null &&
            String(input.body.username).trim() !== username
          ) {
            input.flash('error', 'O usuário não pode ser alterado.');
            return reply.redirect('/minha-conta');
          }
          if (passwordConfirm && !password) {
            input.flash('error', 'Informe a nova senha antes de confirmá-la.');
            return reply.redirect('/minha-conta');
          }
          if (password && !hasRecentAuthentication(input.session.security)) {
            const currentPassword = input.body.current_password;
            if (
              typeof currentPassword !== 'string' ||
              !currentPassword ||
              Buffer.byteLength(currentPassword, 'utf8') > 72 ||
              !(await bcrypt.compare(currentPassword, account.passwordHash))
            ) {
              input.flash(
                'error',
                'Por segurança, saia e entre novamente antes de alterar sua senha.',
              );
              return reply.redirect('/minha-conta');
            }
          }
          if (!name || name.length > 120) {
            input.flash('error', 'Informe um nome com até 120 caracteres.');
            return reply.redirect('/minha-conta');
          }
          if (password) {
            if (
              Array.from(password).length < 15 ||
              Buffer.byteLength(password, 'utf8') > 72 ||
              password !== passwordConfirm
            ) {
              input.flash(
                'error',
                'A nova senha deve ter pelo menos 15 caracteres, no máximo 72 bytes e confirmação igual.',
              );
              return reply.redirect('/minha-conta');
            }
            const passwordHash = await bcrypt.hash(password, 12);
            await execute(
              'UPDATE users SET name = :name, password_hash = :passwordHash WHERE id = :id',
              { id, name, passwordHash },
            );
            if (input.session.security) {
              input.session.security.credentialRevision = credentialRevision({
                id,
                username,
                passwordHash,
                isAdmin: account.isAdmin ?? input.session.user.isAdmin,
                sessionVersion: account.sessionVersion,
              });
            }
          } else {
            await execute('UPDATE users SET name = :name WHERE id = :id', {
              id,
              name,
            });
          }
          // Preserva isAdmin da sessao (senao o menu Admin some ao editar o perfil).
          input.session.user = { ...input.session.user, id, name, username };
          if (password)
            await auditSecurity('credentials.changed', {
              userId: id,
              reason: 'password',
            });
          console.info(
            JSON.stringify({
              event: 'account.updated',
              at: new Date().toISOString(),
              userId: id,
              passwordChanged: Boolean(password),
            }),
          );
          input.flash('success', 'Conta atualizada.');
          return reply.redirect('/minha-conta');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    backup: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const [
            user,
            clientes,
            transacoes,
            planos,
            servidores,
            dispositivos,
            aplicativos,
            mensagens,
            cobrancas,
          ] = await Promise.all([
            queryOne(
              'SELECT id, name, username, email FROM users WHERE id = :userId',
              { userId },
            ),
            queryRows(
              'SELECT * FROM clientes WHERE user_id = :userId ORDER BY id',
              {
                userId,
              },
            ),
            queryRows(
              'SELECT * FROM transacoes WHERE user_id = :userId ORDER BY id',
              { userId },
            ),
            queryRows(
              'SELECT * FROM planos WHERE user_id = :userId ORDER BY id',
              {
                userId,
              },
            ),
            queryRows(
              'SELECT * FROM servidores WHERE user_id = :userId ORDER BY id',
              { userId },
            ),
            queryRows(
              'SELECT * FROM dispositivos WHERE user_id = :userId ORDER BY id',
              { userId },
            ),
            queryRows(
              'SELECT * FROM aplicativos WHERE user_id = :userId ORDER BY id',
              { userId },
            ),
            queryRows(
              'SELECT * FROM mensagens WHERE user_id = :userId ORDER BY id',
              {
                userId,
              },
            ),
            queryRows(
              'SELECT * FROM cobrancas WHERE user_id = :userId ORDER BY id',
              {
                userId,
              },
            ),
          ]);
          const stamp = new Date()
            .toISOString()
            .replace(/[:.]/g, '-')
            .slice(0, 19);
          const filename = `gestor-backup-${userId}-${stamp}.json`;
          reply.setHeader('Cache-Control', 'no-store');
          reply.setHeader('Referrer-Policy', 'no-referrer');
          reply.setHeader('Content-Type', 'application/json; charset=utf-8');
          reply.setHeader(
            'Content-Disposition',
            `attachment; filename="${filename}"`,
          );
          await auditSecurity('backup.exported', { userId, reason: 'account' });
          reply.send(
            JSON.stringify(
              {
                meta: {
                  exportadoEm: new Date().toISOString(),
                  versao: 1,
                  user,
                },
                clientes,
                transacoes,
                planos,
                servidores,
                dispositivos,
                aplicativos,
                mensagens,
                cobrancas,
              },
              null,
              2,
            ),
          );
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}
