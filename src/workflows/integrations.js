import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.js';
export function createIntegrationsWorkflow({
  execute,
  queryOne,
  queryRows,
  encryptSecret,
  decryptSecret,
  sigmaLogin,
}) {
  return {
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const integracoes = await queryRows(
            `SELECT id, tipo, nome, api_url AS apiUrl, username, status
         FROM integracoes WHERE user_id = :userId ORDER BY id DESC`,
            { userId },
          );
          reply.render('pages/integracoes', {
            title: 'Integrações',
            subtitle: 'Gerencie suas integrações com painéis IPTV',
            integracoes,
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    change: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const action = String(input.body.action ?? '');
          const id = Number(input.body.id);
          if (action === 'delete_integracao') {
            await execute(
              'DELETE FROM integracoes WHERE id = :id AND user_id = :userId',
              { id, userId },
            );
            input.flash('success', 'Integração removida.');
            return reply.redirect('/integracoes');
          }
          // Testa a conexão: loga no painel com as credenciais salvas. Mostra
          // claramente se o bloqueio é do Cloudflare (whitelist do IP) vs credencial.
          if (action === 'test_integracao') {
            const row = await queryOne(
              `SELECT id, nome, api_url AS apiUrl, username, senha_enc AS senhaEnc
           FROM integracoes WHERE id = :id AND user_id = :userId LIMIT 1`,
              { id, userId },
            );
            if (!row) {
              input.flash('error', 'Integração não encontrada.');
              return reply.redirect('/integracoes');
            }
            const senha = decryptSecret(String(row.senhaEnc ?? ''));
            const result = await sigmaLogin({
              apiUrl: row.apiUrl,
              username: row.username,
              password: senha,
            });
            if (result.ok)
              input.flash(
                'success',
                `✅ Conexão OK com "${row.nome}" — login no painel funcionou.`,
              );
            else input.flash('error', `❌ "${row.nome}": ${result.error}`);
            return reply.redirect('/integracoes');
          }
          // create / update
          const tipo =
            String(input.body.tipo ?? 'sigma')
              .trim()
              .toLowerCase() || 'sigma';
          const nome = String(input.body.nome ?? '').trim();
          const apiUrl = String(input.body.api_url ?? '').trim();
          const username = String(input.body.username ?? '').trim();
          const senha = String(input.body.password ?? '');
          const status =
            String(input.body.status ?? 'ativo')
              .trim()
              .toLowerCase() === 'inativo'
              ? 'inativo'
              : 'ativo';
          if (!nome || !apiUrl || !username) {
            input.flash('error', 'Preencha nome, URL do painel e usuário.');
            return reply.redirect('/integracoes');
          }
          if (action === 'update_integracao' && id) {
            if (senha) {
              // Senha nova informada — regrava criptografada.
              await execute(
                `UPDATE integracoes SET tipo=:tipo, nome=:nome, api_url=:apiUrl, username=:username,
                  senha_enc=:senhaEnc, status=:status
            WHERE id=:id AND user_id=:userId`,
                {
                  tipo,
                  nome,
                  apiUrl,
                  username,
                  senhaEnc: encryptSecret(senha),
                  status,
                  id,
                  userId,
                },
              );
            } else {
              // Senha em branco no update = mantém a atual.
              await execute(
                `UPDATE integracoes SET tipo=:tipo, nome=:nome, api_url=:apiUrl, username=:username, status=:status
            WHERE id=:id AND user_id=:userId`,
                { tipo, nome, apiUrl, username, status, id, userId },
              );
            }
            input.flash('success', 'Integração atualizada.');
            return reply.redirect('/integracoes');
          }
          // create_integracao (padrão)
          if (!senha) {
            input.flash('error', 'Informe a senha do painel.');
            return reply.redirect('/integracoes');
          }
          await execute(
            `INSERT INTO integracoes (user_id, tipo, nome, api_url, username, senha_enc, status)
       VALUES (:userId, :tipo, :nome, :apiUrl, :username, :senhaEnc, :status)`,
            {
              userId,
              tipo,
              nome,
              apiUrl,
              username,
              senhaEnc: encryptSecret(senha),
              status,
            },
          );
          input.flash('success', 'Integração adicionada.');
          return reply.redirect('/integracoes');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}
