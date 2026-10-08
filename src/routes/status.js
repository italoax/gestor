import { Router } from 'express';
import multer from 'multer';
import { execute, queryRows } from '../db/mysql.js';
import { toNullableString } from '../services/format.js';
import { removerStatusExpirados } from '../services/statusRetention.js';
// Upload em memória — converte direto pra data URL e manda pra API.
// Limite de 5MB: o microserviço aceita JSON até 8MB e base64 cresce ~33%,
// então 5MB de arquivo gera ~6.7MB de data URL (com folga pros outros campos).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const mt = String(file.mimetype || '').toLowerCase();
    if (mt.startsWith('image/') || mt.startsWith('video/'))
      return cb(null, true);
    cb(new Error('Arquivo deve ser imagem ou vídeo.'));
  },
});
async function sessaoWhatsappPrincipal(userId) {
  const rows = await queryRows(
    'SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1',
    { userId },
  );
  return rows[0]?.sessao ?? '';
}
// Converte "2026-06-24T14:30" (datetime-local do HTML) pra formato MySQL.
// Retorna null se vazio/invalido. Erro silencioso: form rejeita antes via validação.
function parseAgendamento(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  // datetime-local vem como "YYYY-MM-DDTHH:mm" — basta trocar T por espaço.
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return `${m[1]} ${m[2]}:00`;
}
export const statusRouter = Router();
statusRouter.get('/status/:id/imagem', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) return res.sendStatus(404);
    const rows = await queryRows(
      `SELECT media_data AS mediaData FROM whatsapp_status
        WHERE id = :id AND user_id = :userId AND tipo = 'image'
          AND (status <> 'postado' OR postado_em > UTC_TIMESTAMP() - INTERVAL 24 HOUR)`,
      { id, userId: req.session.user.id },
    );
    const image = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(
      rows[0]?.mediaData || '',
    );
    if (!image) return res.sendStatus(404);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    res.type(image[1]).send(Buffer.from(image[2], 'base64'));
  } catch (error) {
    next(error);
  }
});
statusRouter.get('/status/historico', async (req, res, next) => {
  try {
    await removerStatusExpirados(req.session.user.id);
    const historico = await queryRows(
      `SELECT id, tipo, texto, cor_fundo AS corFundo, fonte, media_url AS mediaUrl,
              (tipo = 'image' AND media_data IS NOT NULL) AS temImagem,
              legenda, status, erro, destinatarios,
              postado_em AS postadoEm, agendado_para AS agendadoPara, created_at AS createdAt
         FROM whatsapp_status WHERE user_id = :userId ORDER BY created_at DESC LIMIT 50`,
      { userId: req.session.user.id },
    );
    res.set('Cache-Control', 'no-store');
    res.render('partials/status-historico', { layout: false, historico });
  } catch (error) {
    next(error);
  }
});
statusRouter.get('/status', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await removerStatusExpirados(userId);
    const historico = await queryRows(
      `SELECT id, tipo, texto, cor_fundo AS corFundo, fonte, media_url AS mediaUrl,
              (tipo = 'image' AND media_data IS NOT NULL) AS temImagem,
              legenda, status, erro, destinatarios,
              postado_em AS postadoEm, agendado_para AS agendadoPara, created_at AS createdAt
         FROM whatsapp_status
        WHERE user_id = :userId
        ORDER BY created_at DESC
        LIMIT 50`,
      { userId },
    );
    const sessao = await sessaoWhatsappPrincipal(userId);
    res.render('pages/status', {
      title: 'Status WhatsApp',
      subtitle:
        'Publique stories no seu WhatsApp pra promoções, avisos e novidades.',
      historico,
      temWhatsapp: Boolean(sessao),
    });
  } catch (error) {
    next(error);
  }
});
// Wrapper do multer: limites e fileFilter rejeitam → erro vira flash em vez
// de tela 500 (UX ruim). Continua o handler normal só se passou.
function uploadOrFlash(req, res, next) {
  upload.single('media_file')(req, res, (err) => {
    if (!err) return next();
    const msg = err instanceof Error ? err.message : String(err);
    const fmt = msg.includes('File too large')
      ? 'Arquivo muito grande (máx 5 MB).'
      : msg;
    req.flash('error', fmt);
    return res.redirect('/status');
  });
}
statusRouter.post('/status', uploadOrFlash, async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const action = String(req.body.action ?? '');
    if (action === 'delete_status') {
      const id = Number(req.body.id);
      await execute(
        'DELETE FROM whatsapp_status WHERE id = :id AND user_id = :userId',
        { id, userId },
      );
      req.flash('success', 'Registro removido.');
      return res.redirect('/status');
    }
    if (action === 'cancelar_agendamento') {
      const id = Number(req.body.id);
      // Só cancela se ainda estiver agendado — evita corrida com o cron que pode
      // ter postado entre o usuário clicar e o servidor receber.
      const result = await execute(
        "DELETE FROM whatsapp_status WHERE id = :id AND user_id = :userId AND status = 'agendado'",
        { id, userId },
      );
      if (result.affectedRows > 0) {
        req.flash('success', 'Agendamento cancelado.');
      } else {
        req.flash(
          'error',
          'Não foi possível cancelar (já publicado ou removido).',
        );
      }
      return res.redirect('/status');
    }
    // Publicar status
    let original = null;
    const editId = action === 'editar_status' ? Number(req.body.id) : null;
    if (editId !== null) {
      if (!Number.isSafeInteger(editId) || editId <= 0) {
        req.flash('error', 'Agendamento inválido.');
        return res.redirect('/status');
      }
      const rows = await queryRows(
        "SELECT tipo, media_data AS mediaData, media_url AS mediaResumo FROM whatsapp_status WHERE id = :id AND user_id = :userId AND status = 'agendado'",
        { id: editId, userId },
      );
      original = rows[0];
      if (!original) {
        req.flash(
          'error',
          'Este status já foi publicado, está publicando ou foi removido.',
        );
        return res.redirect('/status');
      }
    }
    const tipoRaw = String(req.body.tipo ?? 'text').toLowerCase();
    const tipo = ['text', 'image', 'video'].includes(tipoRaw)
      ? tipoRaw
      : 'text';
    const texto =
      typeof req.body.texto === 'string' && req.body.texto.trim()
        ? req.body.texto
        : null;
    const corFundo = toNullableString(req.body.cor_fundo);
    const fonte = req.body.fonte ? Number(req.body.fonte) : null;
    const legenda =
      typeof req.body.legenda === 'string' && req.body.legenda.trim()
        ? req.body.legenda
        : null;
    // Mídia agora vem como arquivo (multer). Converte pra data URL — a API faz
    // fetch() e o Node aceita nativamente data: URLs, sem precisar mexer no
    // microserviço nem hospedar arquivo em algum lugar.
    let mediaUrl = null;
    if (req.file) {
      const mime =
        req.file.mimetype || (tipo === 'video' ? 'video/mp4' : 'image/jpeg');
      mediaUrl = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    } else if (original?.tipo === tipo) {
      mediaUrl = original.mediaData;
    }
    if (tipo === 'text' && !texto) {
      req.flash('error', 'Digite o texto do status.');
      return res.redirect('/status');
    }
    if ((tipo === 'image' || tipo === 'video') && !mediaUrl) {
      req.flash('error', 'Anexe o arquivo de mídia.');
      return res.redirect('/status');
    }
    const sessao = await sessaoWhatsappPrincipal(userId);
    if (!sessao) {
      req.flash(
        'error',
        'Cadastre um dispositivo WhatsApp antes de postar status.',
      );
      return res.redirect('/status');
    }
    // Agendamento obrigatório — não há mais fluxo de publicação imediata.
    // O statusCron publica no horário marcado. media_data guarda o data URL
    // inteiro (MEDIUMTEXT); imagens ficam disponíveis para a prévia no histórico.
    const localAgendamento = parseAgendamento(req.body.agendado_para);
    const offset = Number(req.body.agendado_offset ?? 180);
    if (
      !localAgendamento ||
      !Number.isInteger(offset) ||
      Math.abs(offset) > 840
    ) {
      req.flash('error', 'Informe a data e hora da publicação.');
      return res.redirect('/status');
    }
    const alvo = new Date(
      new Date(localAgendamento.replace(' ', 'T') + 'Z').getTime() +
        offset * 60000,
    );
    if (!Number.isFinite(alvo.getTime()) || alvo.getTime() <= Date.now()) {
      req.flash(
        'error',
        'Data/hora de agendamento já passou. Escolha um momento futuro.',
      );
      return res.redirect('/status');
    }
    const mediaResumo = req.file
      ? `${req.file.originalname || 'arquivo'} (${(req.file.size / 1024).toFixed(0)} KB · ${req.file.mimetype})`
      : original?.tipo === tipo
        ? original.mediaResumo
        : null;
    const agendadoPara = alvo.toISOString().slice(0, 19).replace('T', ' ');
    if (original) {
      const result = await execute(
        `UPDATE whatsapp_status SET tipo = :tipo, texto = :texto, cor_fundo = :corFundo,
            fonte = :fonte, media_url = :mediaResumo, media_data = :mediaData,
            legenda = :legenda, agendado_para = :agendadoPara
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
        },
      );
      req.flash(
        result.affectedRows ? 'success' : 'error',
        result.affectedRows
          ? 'Agendamento atualizado.'
          : 'O status começou a publicar e não pode mais ser editado.',
      );
      return res.redirect('/status');
    }
    await execute(
      `INSERT INTO whatsapp_status (user_id, tipo, texto, cor_fundo, fonte, media_url, media_data,
            legenda, status, agendado_para)
       VALUES (:userId, :tipo, :texto, :corFundo, :fonte, :mediaResumo, :mediaData,
            :legenda, 'agendado', :agendadoPara)`,
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
      },
    );
    req.flash(
      'success',
      `Status agendado para ${localAgendamento.slice(0, 16).replace(' ', ' às ')}.`,
    );
    return res.redirect('/status');
  } catch (error) {
    next(error);
  }
});
