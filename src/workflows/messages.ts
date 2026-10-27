import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
import { normalizeMessageVariables } from '../shared/messageVariables.ts';
export function createMessagesWorkflow({
  execute,
  queryRows,
  toNullableString,
}) {
  async function jaSemeou(userId, chave) {
    const rows = await queryRows(
      'SELECT user_id FROM user_seeds WHERE user_id = :userId AND chave = :chave LIMIT 1',
      { userId, chave },
    );
    return rows.length > 0;
  }
  async function marcarSemeado(userId, chave) {
    await execute(
      'INSERT IGNORE INTO user_seeds (user_id, chave) VALUES (:userId, :chave)',
      { userId, chave },
    );
  }
  const MENSAGENS_PADRAO = [
    [
      'Boas-vindas',
      'Mensagem de boas-vindas ao novo cliente',
      '{saudacao}! 🎉 Seja bem-vindo(a), {nome}!\n\nSuas credenciais de acesso:\n👤 *Usuário:* {usuario}\n🔑 *Senha:* {senha}\n📦 *Plano:* {plano}\n📅 *Vencimento:* {vencimento}\n\nQualquer dúvida, estamos à disposição! 💬',
    ],
    [
      'Credenciais de acesso',
      'Usuário, senha, plano e vencimento',
      '{saudacao} {nome}! 📲 Seus dados de acesso:\n\n👤 *Usuário:* {usuario}\n🔑 *Senha:* {senha}\n📦 *Plano:* {plano}\n📅 *Vencimento:* {vencimento}\n\nGuarde com segurança! 🔒',
    ],
    [
      'Aviso de vencimento',
      'Aviso enviado dias antes do vencimento',
      '{saudacao} {nome}! ⚠️ Seu plano vence em *{vencimento}*.\n\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nRenove para não perder o acesso. 🙏',
    ],
    [
      'Vence hoje',
      'Lembrete enviado no dia do vencimento',
      '{saudacao} {nome}! ⚠️ Seu acesso vence *hoje*!\n\nRenove agora para não perder o acesso:\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nQualquer dúvida, é só chamar! 😉',
    ],
    [
      'Acesso expirado',
      'Mensagem enviada após o vencimento',
      '{saudacao} {nome}! ❌ Seu acesso expirou.\n\nRenove agora e volte a aproveitar:\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nQualquer dúvida, é só chamar! 😉',
    ],
    [
      'Cobrança manual',
      'Template para cobrança avulsa',
      '{saudacao} {nome}! 💰 Passando para lembrar sobre a renovação do seu plano.\n\n📅 *Vencimento:* {vencimento}\n💰 *Valor:* {valor}\n\nPosso te ajudar com a renovação? 😊',
    ],
    [
      'Link de pagamento',
      'Link PIX para renovação',
      '{saudacao} {nome}! 💳 Segue o link para renovação do seu plano:\n\n🔗 *Link:* {link_cliente}\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nApós o pagamento, seu acesso é liberado! ✅',
    ],
    [
      'Renovação confirmada',
      'Enviada após confirmação de renovação',
      '{saudacao} {nome}! ✅ Sua renovação foi confirmada!\n\n📦 *Plano:* {plano}\n📅 *Novo vencimento:* {vencimento}\n\nObrigado pela confiança! Bom proveito! 🎉',
    ],
    [
      'Falha na Renovação do Painel',
      'Enviada ao cliente quando a renovação automática no painel falha',
      '{saudacao} {nome}! ⚠️ Sua renovação foi processada, porém ocorreu uma instabilidade ao atualizar o painel.\n\nJá estamos resolvendo e seu acesso será normalizado em instantes. Obrigado pela compreensão! 🙏',
    ],
    [
      'Como está o serviço?',
      'Feedback 5 dias após o vencimento — verificar se cliente ainda tem interesse',
      '{saudacao} {primeiro_nome}! 👋 Passando para saber como você está!\n\nPercebemos que seu acesso não foi renovado. Está tudo certo com o serviço? Se precisar de algo, é só falar! 🙌',
    ],
    [
      'Follow-up pós-cadastro',
      'Enviado 5 dias após o cadastro para saber se o cliente está satisfeito',
      '{saudacao} {primeiro_nome}! 😊 Passando para saber como está sendo sua experiência com o serviço!\n\nEstá tudo funcionando bem? Qualquer dúvida ou sugestão, conte com a gente! 💬',
    ],
  ];
  async function seedMensagensPadrao(userId) {
    // Semeia os templates padrão UMA ÚNICA VEZ (não recria os apagados depois).
    if (await jaSemeou(userId, 'mensagens')) return;
    const existentes = await queryRows(
      'SELECT titulo FROM mensagens WHERE user_id = :userId',
      { userId },
    );
    const titulos = new Set(
      existentes.map((r) => String(r.titulo).trim().toLowerCase()),
    );
    for (const [titulo, descricao, mensagem] of MENSAGENS_PADRAO) {
      if (titulos.has(titulo.toLowerCase())) continue;
      await execute(
        `INSERT INTO mensagens (user_id, titulo, descricao, mensagem) VALUES (:userId, :titulo, :descricao, :mensagem)`,
        { userId, titulo, descricao, mensagem },
      );
    }
    await marcarSemeado(userId, 'mensagens');
  }
  return {
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          await seedMensagensPadrao(userId);
          const mensagens = await queryRows(
            `SELECT id, titulo, descricao, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC`,
            { userId },
          );
          reply.render('pages/mensagens', {
            title: 'Mensagens',
            subtitle: 'Templates de mensagem para envio automático e manual',
            mensagens: mensagens.map((item) => ({
              ...item,
              mensagem: normalizeMessageVariables(item.mensagem),
            })),
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    change: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          const id = Number(input.body.id);
          const action = String(input.body.action ?? '');
          if (action === 'delete_mensagem') {
            await execute(
              'DELETE FROM mensagens WHERE id = :id AND user_id = :userId',
              { id, userId },
            );
            input.flash('success', 'Mensagem apagada.');
          } else {
            const data = {
              userId,
              id,
              titulo: String(input.body.titulo ?? '').trim(),
              descricao: toNullableString(input.body.descricao),
              mensagem: toNullableString(
                normalizeMessageVariables(input.body.mensagem),
              ),
              mediaTipo: toNullableString(input.body.media_tipo),
              mediaPath: toNullableString(input.body.media_path),
            };
            if (action === 'update_mensagem') {
              await execute(
                `UPDATE mensagens SET titulo = :titulo, descricao = :descricao, mensagem = :mensagem, media_tipo = :mediaTipo, media_path = :mediaPath WHERE id = :id AND user_id = :userId`,
                data,
              );
              input.flash('success', 'Mensagem atualizada.');
            } else {
              await execute(
                `INSERT INTO mensagens (user_id, titulo, descricao, mensagem, media_tipo, media_path) VALUES (:userId, :titulo, :descricao, :mensagem, :mediaTipo, :mediaPath)`,
                data,
              );
              input.flash('success', 'Mensagem criada.');
            }
          }
          reply.redirect('/mensagens');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}
