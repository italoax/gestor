import { automationsEnabled } from '../security/automationPolicy.ts';
import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.ts';
export function createStatusWorkflow({
  env,
  execute,
  queryRows,
  toNullableString,
  removerStatusExpirados,
  statusHistoryData,
  removerStatusWhatsapp = undefined,
}) {
  async function sessaoWhatsappPrincipal(userId) {
    const rows = await queryRows(
      'SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1',
      { userId },
    );
    return rows[0]?.sessao ?? '';
  }
  function parseAgendamento(input) {
    const raw = String(input ?? '').trim();
    if (!raw) return null;
    // datetime-local vem como "YYYY-MM-DDTHH:mm" — basta trocar T por espaço.
    const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
    if (!m) return null;
    const parsed = new Date(`${m[1]}T${m[2]}:00Z`);
    if (
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 16) !== `${m[1]}T${m[2]}`
    )
      return null;
    return `${m[1]} ${m[2]}:00`;
  }
  return {
    image: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const id = Number(input.params.id);
          if (!Number.isSafeInteger(id) || id <= 0)
            return reply.sendStatus(404);
          const rows = await queryRows(
            `SELECT media_data AS mediaData FROM whatsapp_status
        WHERE id = :id AND user_id = :userId AND tipo = 'image'
          AND (status <> 'postado' OR postado_em > UTC_TIMESTAMP() - INTERVAL 24 HOUR)`,
            { id, userId: input.session.user.id },
          );
          const image =
            /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
              rows[0]?.mediaData || '',
            );
          if (!image) return reply.sendStatus(404);
          reply.set('Cache-Control', 'no-store');
          reply.set('Content-Security-Policy', "default-src 'none'; sandbox");
          reply.type(image[1]).send(Buffer.from(image[2], 'base64'));
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    history: (input) =>
      workflowResult(input, async (reply) => {
        try {
          await removerStatusExpirados(input.session.user.id);
          const historico = await queryRows(
            `SELECT id, tipo, texto, cor_fundo AS corFundo, fonte, media_url AS mediaUrl,
              (tipo = 'image' AND media_data IS NOT NULL) AS temImagem,
              legenda, status, erro, destinatarios,
              postado_em AS postadoEm, agendado_para AS agendadoPara, remover_em AS removerEm, created_at AS createdAt
         FROM whatsapp_status WHERE user_id = :userId ORDER BY created_at DESC LIMIT 50`,
            { userId: input.session.user.id },
          );
          reply.set('Cache-Control', 'no-store');
          if (input.get('accept')?.includes('application/json'))
            return reply.json({ historico: statusHistoryData(historico) });
          reply.render('partials/status-historico', {
            layout: false,
            historico,
          });
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
    list: (input) =>
      workflowResult(input, async (reply) => {
        try {
          const userId = input.session.user.id;
          await removerStatusExpirados(userId);
          const historico = await queryRows(
            `SELECT id, tipo, texto, cor_fundo AS corFundo, fonte, media_url AS mediaUrl,
              (tipo = 'image' AND media_data IS NOT NULL) AS temImagem,
              legenda, status, erro, destinatarios,
              postado_em AS postadoEm, agendado_para AS agendadoPara, remover_em AS removerEm, created_at AS createdAt
         FROM whatsapp_status
        WHERE user_id = :userId
        ORDER BY created_at DESC
        LIMIT 50`,
            { userId },
          );
          const sessao = await sessaoWhatsappPrincipal(userId);
          reply.render('pages/status', {
            title: 'Status WhatsApp',
            subtitle:
              'Publique stories no seu WhatsApp pra promoções, avisos e novidades.',
            historico,
            temWhatsapp: Boolean(sessao),
            agendamentoAtivo: automationsEnabled(env),
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
          if (action === 'delete_status') {
            const id = Number(input.body.id);
            const result = await removerStatusWhatsapp(id, userId);
            input.flash(
              result.ok ? 'success' : 'error',
              result.ok ? 'Status removido.' : result.error,
            );
            return reply.redirect('/status');
          }
          if (action === 'cancelar_agendamento') {
            const id = Number(input.body.id);
            // Só cancela se ainda estiver agendado — evita corrida com o agendador que pode
            // ter postado entre o usuário clicar e o servidor receber.
            const result = await execute(
              "DELETE FROM whatsapp_status WHERE id = :id AND user_id = :userId AND status = 'agendado'",
              { id, userId },
            );
            if (result.affectedRows > 0) {
              input.flash('success', 'Agendamento cancelado.');
            } else {
              input.flash(
                'error',
                'Não foi possível cancelar (já publicado ou removido).',
              );
            }
            return reply.redirect('/status');
          }
          // Publicar status
          let original = null;
          const editId =
            action === 'editar_status' ? Number(input.body.id) : null;
          if (editId !== null) {
            if (!Number.isSafeInteger(editId) || editId <= 0) {
              input.flash('error', 'Agendamento inválido.');
              return reply.redirect('/status');
            }
            const rows = await queryRows(
              "SELECT tipo, media_data AS mediaData, media_url AS mediaResumo FROM whatsapp_status WHERE id = :id AND user_id = :userId AND status = 'agendado'",
              { id: editId, userId },
            );
            original = rows[0];
            if (!original) {
              input.flash(
                'error',
                'Este status já foi publicado, está publicando ou foi removido.',
              );
              return reply.redirect('/status');
            }
          }
          const tipoRaw = String(input.body.tipo ?? 'text').toLowerCase();
          const tipo = ['text', 'image', 'video'].includes(tipoRaw)
            ? tipoRaw
            : 'text';
          const texto =
            typeof input.body.texto === 'string' && input.body.texto.trim()
              ? input.body.texto
              : null;
          const corFundo = toNullableString(input.body.cor_fundo);
          const fonte = input.body.fonte ? Number(input.body.fonte) : null;
          const legenda =
            typeof input.body.legenda === 'string' && input.body.legenda.trim()
              ? input.body.legenda
              : null;
          // Mídia agora vem como arquivo (multer). Converte pra data URL — a API faz
          // fetch() e o Node aceita nativamente data: URLs, sem precisar mexer no
          // microserviço nem hospedar arquivo em algum lugar.
          let mediaUrl = null;
          if (input.file) {
            const mime =
              input.file.mimetype ||
              (tipo === 'video' ? 'video/mp4' : 'image/jpeg');
            mediaUrl = `data:${mime};base64,${input.file.buffer.toString('base64')}`;
          } else if (original?.tipo === tipo) {
            mediaUrl = original.mediaData;
          }
          if (tipo === 'text' && !texto) {
            input.flash('error', 'Digite o texto do status.');
            return reply.redirect('/status');
          }
          if ((tipo === 'image' || tipo === 'video') && !mediaUrl) {
            input.flash('error', 'Anexe o arquivo de mídia.');
            return reply.redirect('/status');
          }
          const sessao = await sessaoWhatsappPrincipal(userId);
          if (!sessao) {
            input.flash(
              'error',
              'Cadastre um dispositivo WhatsApp antes de postar status.',
            );
            return reply.redirect('/status');
          }
          // Agendamento obrigatório — não há mais fluxo de publicação imediata.
          // O statusScheduler publica no horário marcado. media_data guarda o data URL
          // inteiro (MEDIUMTEXT); imagens ficam disponíveis para a prévia no histórico.
          const localAgendamento = parseAgendamento(input.body.agendado_para);
          const offset = Number(input.body.agendado_offset ?? 180);
          if (
            !localAgendamento ||
            !Number.isInteger(offset) ||
            Math.abs(offset) > 840
          ) {
            input.flash('error', 'Informe a data e hora da publicação.');
            return reply.redirect('/status');
          }
          const alvo = new Date(
            new Date(localAgendamento.replace(' ', 'T') + 'Z').getTime() +
              offset * 60000,
          );
          if (
            !Number.isFinite(alvo.getTime()) ||
            alvo.getTime() <= Date.now()
          ) {
            input.flash(
              'error',
              'Data/hora de agendamento já passou. Escolha um momento futuro.',
            );
            return reply.redirect('/status');
          }
          const mediaResumo = input.file
            ? `${input.file.originalname || 'arquivo'} (${(input.file.size / 1024).toFixed(0)} KB · ${input.file.mimetype})`
            : original?.tipo === tipo
              ? original.mediaResumo
              : null;
          let removerEm = null;
          if (String(input.body.remover_em ?? '').trim()) {
            const localFim = parseAgendamento(input.body.remover_em);
            const offsetFim = Number(input.body.remover_offset ?? offset);
            const fim =
              localFim &&
              Number.isInteger(offsetFim) &&
              Math.abs(offsetFim) <= 840
                ? new Date(
                    new Date(localFim.replace(' ', 'T') + 'Z').getTime() +
                      offsetFim * 60000,
                  )
                : null;
            if (
              !fim ||
              !Number.isFinite(fim.getTime()) ||
              fim.getTime() <= alvo.getTime() ||
              fim.getTime() - alvo.getTime() > 24 * 60 * 60 * 1000
            ) {
              input.flash(
                'error',
                'O término deve ser depois da publicação e dentro de 24 horas.',
              );
              return reply.redirect('/status');
            }
            removerEm = fim.toISOString().slice(0, 19).replace('T', ' ');
          }
          const agendadoPara = alvo
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');
          if (original) {
            const result = await execute(
              `UPDATE whatsapp_status SET tipo = :tipo, texto = :texto, cor_fundo = :corFundo,
            fonte = :fonte, media_url = :mediaResumo, media_data = :mediaData,
            legenda = :legenda, agendado_para = :agendadoPara, remover_em = :removerEm
          WHERE id = :id AND user_id = :userId AND status = 'agendado'`,
              {
                id: editId,
                userId,
                tipo,
                texto,
                corFundo,
                fonte,
                mediaResumo,
                mediaData: mediaUrl,
                legenda,
                agendadoPara,
                removerEm,
              },
            );
            input.flash(
              result.affectedRows ? 'success' : 'error',
              result.affectedRows
                ? 'Agendamento atualizado.'
                : 'O status começou a publicar e não pode mais ser editado.',
            );
            return reply.redirect('/status');
          }
          await execute(
            `INSERT INTO whatsapp_status (user_id, tipo, texto, cor_fundo, fonte, media_url, media_data,
            legenda, status, agendado_para, remover_em)
       VALUES (:userId, :tipo, :texto, :corFundo, :fonte, :mediaResumo, :mediaData,
            :legenda, 'agendado', :agendadoPara, :removerEm)`,
            {
              userId,
              tipo,
              texto,
              corFundo,
              fonte,
              mediaResumo,
              mediaData: mediaUrl,
              legenda,
              agendadoPara,
              removerEm,
            },
          );
          input.flash(
            'success',
            `Status agendado para ${localAgendamento.slice(0, 16).replace(' ', ' às ')}.`,
          );
          return reply.redirect('/status');
        } catch (error) {
          raiseWorkflowError(error);
        }
      }),
  };
}
