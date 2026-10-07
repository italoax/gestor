import { Router } from 'express';
import { execute, queryOne, queryRows } from '../db/mysql.js';
import { encryptSecret, decryptSecret } from '../services/crypto.js';
import { sigmaLogin } from '../services/sigma.js';
export const integracoesRouter = Router();
// Página de integrações com painéis IPTV. Por enquanto o único tipo com
// integração funcional é o "sigma" (dashgen e afins); a estrutura já aceita
// outros tipos no futuro sem mudar o schema.
integracoesRouter.get('/integracoes', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const integracoes = await queryRows(
      `SELECT id, tipo, nome, api_url AS apiUrl, username, status
         FROM integracoes WHERE user_id = :userId ORDER BY id DESC`,
      { userId },
    );
    res.render('pages/integracoes', {
      title: 'Integrações',
      subtitle: 'Gerencie suas integrações com painéis IPTV',
      integracoes,
    });
  } catch (error) {
    next(error);
  }
});
integracoesRouter.post('/integracoes', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const action = String(req.body.action ?? '');
    const id = Number(req.body.id);
    if (action === 'delete_integracao') {
      await execute(
        'DELETE FROM integracoes WHERE id = :id AND user_id = :userId',
        { id, userId },
      );
      req.flash('success', 'Integração removida.');
      return res.redirect('/integracoes');
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
        req.flash('error', 'Integração não encontrada.');
        return res.redirect('/integracoes');
      }
      const senha = decryptSecret(String(row.senhaEnc ?? ''));
      const result = await sigmaLogin({
        apiUrl: row.apiUrl,
        username: row.username,
        password: senha,
      });
      if (result.ok)
        req.flash(
          'success',
          `✅ Conexão OK com "${row.nome}" — login no painel funcionou.`,
        );
      else req.flash('error', `❌ "${row.nome}": ${result.error}`);
      return res.redirect('/integracoes');
    }
    // create / update
    const tipo =
      String(req.body.tipo ?? 'sigma')
        .trim()
        .toLowerCase() || 'sigma';
    const nome = String(req.body.nome ?? '').trim();
    const apiUrl = String(req.body.api_url ?? '').trim();
    const username = String(req.body.username ?? '').trim();
    const senha = String(req.body.password ?? '');
    const status =
      String(req.body.status ?? 'ativo')
        .trim()
        .toLowerCase() === 'inativo'
        ? 'inativo'
        : 'ativo';
    if (!nome || !apiUrl || !username) {
      req.flash('error', 'Preencha nome, URL do painel e usuário.');
      return res.redirect('/integracoes');
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
      req.flash('success', 'Integração atualizada.');
      return res.redirect('/integracoes');
    }
    // create_integracao (padrão)
    if (!senha) {
      req.flash('error', 'Informe a senha do painel.');
      return res.redirect('/integracoes');
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
    req.flash('success', 'Integração adicionada.');
    return res.redirect('/integracoes');
  } catch (error) {
    next(error);
  }
});
