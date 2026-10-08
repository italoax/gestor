import { Router } from 'express';
import { env } from '../config/env.js';
import { execute, queryOne, queryRows } from '../db/mysql.js';
import { appTodayIso } from '../services/dates.js';
import { ensureCobrancasEnviosTable } from '../services/cobrancasCron.js';
export const whatsappRouter = Router();
function sessionApiUrl(pathTemplate, session) {
  if (!env.whatsapp.sessionApiUrl) return '';
  const s = encodeURIComponent(session);
  const path = pathTemplate
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\{\s*session\s*\}/gi, s)
    .replace(/:session\b/gi, s)
    .replace(/\[\s*session\s*\]/gi, s);
  return `${env.whatsapp.sessionApiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
function sessionApiHeaders() {
  const token = env.whatsapp.sessionApiToken.trim();
  return token ? { Authorization: `Bearer ${token}`, token } : {};
}
function traduzirErroWhatsapp(error) {
  const message = String(
    error instanceof Error ? error.message : (error ?? ''),
  ).trim();
  if (!message) return '';
  if (/QR refs attempts ended/i.test(message))
    return 'O QR Code expirou. Gere um novo e leia assim que aparecer.';
  if (
    /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|network|abort/i.test(
      message,
    )
  )
    return 'Não foi possível conectar à API do WhatsApp.';
  if (/unauthorized|forbidden|invalid token|token/i.test(message))
    return 'Token da API do WhatsApp inválido ou ausente.';
  if (/not found|Cannot GET|Cannot POST/i.test(message))
    return 'Endpoint da API do WhatsApp não encontrado.';
  if (/session.*not.*found|no session/i.test(message))
    return 'Sessão não encontrada. Clique em Conectar para criar.';
  return message;
}
function normalizeSessionState(data, session) {
  const json = typeof data === 'object' && data !== null ? data : {};
  const rawStatus = String(
    json.status ??
      json.state ??
      (json.connected ? 'conectado' : 'desconectado'),
  ).toLowerCase();
  const status = [
    'connected',
    'open',
    'islogged',
    'authenticated',
    'ready',
    'conectado',
  ].includes(rawStatus)
    ? 'conectado'
    : ['qr', 'qrcode', 'scan', 'pairing'].includes(rawStatus)
      ? 'qr'
      : ['starting', 'loading', 'initializing', 'iniciando'].includes(rawStatus)
        ? 'iniciando'
        : ['error', 'erro', 'failed'].includes(rawStatus)
          ? 'erro'
          : rawStatus;
  const qrValue =
    json.qrImage ??
    json.qrCode ??
    json.qrcode ??
    json.qr ??
    json.base64 ??
    json.image ??
    json.data;
  const qrText = typeof qrValue === 'string' ? qrValue : '';
  const qrCode = qrText
    ? qrText.startsWith('data:image')
      ? qrText
      : qrText.startsWith('/9j') || qrText.startsWith('iVBOR')
        ? `data:image/png;base64,${qrText}`
        : qrText
    : undefined;
  const pairingValue = json.pairingCode ?? json.pairing_code ?? json.code;
  const pairingCode =
    typeof pairingValue === 'string' && pairingValue.trim()
      ? pairingValue.trim()
      : undefined;
  const connected = Boolean(json.connected || status === 'conectado');
  const hasUsableQr = Boolean(qrCode) && !pairingCode;
  const hasPairing = Boolean(pairingCode) && !connected;
  // Número conectado (devolvido como dígitos puros pelo microserviço).
  const number =
    typeof json.number === 'string' ? json.number.replace(/\D+/g, '') : '';
  const pushName =
    typeof json.pushName === 'string' ? json.pushName.trim() : '';
  return {
    session: String(json.session ?? session),
    status: hasPairing
      ? 'pairing'
      : hasUsableQr && status !== 'conectado'
        ? 'qr'
        : status,
    qrCode: hasPairing ? undefined : qrCode,
    pairingCode: hasPairing ? pairingCode : undefined,
    lastError:
      hasPairing || (hasUsableQr && status !== 'conectado')
        ? undefined
        : traduzirErroWhatsapp(json.lastError ?? json.error),
    connected,
    number,
    pushName,
  };
}
async function requestSessionApi(
  pathTemplate,
  method,
  session,
  body,
  timeoutMs = 9000,
) {
  const url = sessionApiUrl(pathTemplate, session);
  if (!url)
    return {
      session,
      status: 'erro',
      lastError: 'WA_SESSION_API_URL ausente.',
    };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: body
        ? { 'Content-Type': 'application/json', ...sessionApiHeaders() }
        : sessionApiHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await response.text();
    let data = txt;
    try {
      data = txt ? JSON.parse(txt) : {};
    } catch {
      /* mantém texto */
    }
    if (!response.ok) {
      const j = typeof data === 'object' && data !== null ? data : {};
      return {
        session,
        status: 'erro',
        lastError:
          traduzirErroWhatsapp(j.error ?? j.lastError) ||
          `Erro HTTP ${response.status}`,
      };
    }
    return normalizeSessionState(data, session);
  } catch (error) {
    return { session, status: 'erro', lastError: traduzirErroWhatsapp(error) };
  } finally {
    clearTimeout(timer);
  }
}
async function syncBloqueioChamadas(session, enabled) {
  const url = sessionApiUrl(env.whatsapp.sessionCallsBlockPath, session);
  if (!url) throw new Error('URL da API do WhatsApp não configurada.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...sessionApiHeaders() },
      body: JSON.stringify({ enabled }),
    });
    if (!response.ok)
      throw new Error(`A API do WhatsApp retornou HTTP ${response.status}.`);
    const data = await response.json();
    if (
      data?.ok !== true ||
      data.rejectCalls !== enabled ||
      data.session !== session
    ) {
      throw new Error('A API do WhatsApp não confirmou o estado solicitado.');
    }
  } catch (error) {
    throw new Error(
      traduzirErroWhatsapp(error) ||
        'Não foi possível confirmar o bloqueio na API do WhatsApp.',
    );
  } finally {
    clearTimeout(timer);
  }
}
async function getDeviceState(session) {
  const state = await requestSessionApi(
    env.whatsapp.sessionStatusPath,
    'GET',
    session,
  );
  if (state.connected || state.qrCode || state.pairingCode) return state;
  const qrState = await requestSessionApi(
    env.whatsapp.sessionQrPath,
    'GET',
    session,
  );
  if (qrState.qrCode)
    return {
      ...state,
      status: 'qr',
      qrCode: qrState.qrCode,
      lastError: undefined,
    };
  return state;
}
function gerarSessao(nome) {
  const semAcento = String(nome)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const base =
    semAcento
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 24) || 'dispositivo';
  return `${base}-${Math.random().toString(36).slice(2, 7)}`;
}
async function listarDevices(userId) {
  return queryRows(
    'SELECT id, nome, sessao, bloqueio_chamadas AS bloqueioChamadas, principal FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC',
    { userId },
  );
}
async function ensureDispositivoPrincipal(userId) {
  const rows = await queryRows(
    'SELECT COUNT(*) AS total FROM whatsapp_devices WHERE user_id = :userId',
    { userId },
  );
  if (Number(rows[0]?.total ?? 0) > 0) return;
  // Gera sessão única por usuário — antes saía "default" para todos, e dois
  // usuários sem dispositivos próprios acabavam compartilhando a mesma sessão
  // no microserviço (cada login mandando pelo aparelho do outro).
  await execute(
    "INSERT INTO whatsapp_devices (user_id, nome, sessao, principal) VALUES (:userId, 'Principal', :sessao, 1)",
    { userId, sessao: gerarSessao(`u${userId}-principal`) },
  );
}
async function carregarDevice(userId, id) {
  return queryOne(
    'SELECT id, nome, sessao, bloqueio_chamadas AS bloqueioChamadas, principal FROM whatsapp_devices WHERE id = :id AND user_id = :userId LIMIT 1',
    { id, userId },
  );
}
whatsappRouter.get('/whatsapp', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    await ensureCobrancasEnviosTable();
    await ensureDispositivoPrincipal(userId);
    const today = appTodayIso();
    const [devices, envios] = await Promise.all([
      listarDevices(userId),
      queryRows(
        `SELECT COALESCE(SUM(ce.status='enviado'),0) AS enviados, COALESCE(SUM(ce.status='erro'),0) AS erros
           FROM cobrancas_envios ce JOIN cobrancas c ON c.id = ce.cobranca_id
          WHERE c.user_id = :userId AND ce.data_envio = :today`,
        { userId, today },
      ),
    ]);
    const enviados = Number(envios[0]?.enviados ?? 0);
    const erros = Number(envios[0]?.erros ?? 0);
    const stats = {
      total: devices.length,
      mensagensHoje: enviados,
      entrega:
        enviados + erros > 0
          ? Math.round((enviados / (enviados + erros)) * 100)
          : 0,
    };
    res.render('pages/whatsapp', {
      title: 'WhatsApp',
      subtitle:
        'Gerencie múltiplos dispositivos WhatsApp para envio de mensagens',
      devices,
      stats,
    });
  } catch (error) {
    next(error);
  }
});
// CRUD de dispositivos (form normal)
whatsappRouter.post('/whatsapp', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const action = String(req.body.action ?? '');
    const id = Number(req.body.id);
    if (action === 'add_device') {
      // Sistema agora trabalha com apenas 1 conexão por usuário — o "Principal" já é
      // criado automaticamente em ensureDispositivoPrincipal. Bloqueia tentativa de
      // cadastrar dispositivo extra.
      req.flash('error', 'Apenas uma conexão WhatsApp por conta.');
      return res.redirect('/whatsapp');
    } else if (action === 'delete_device') {
      await execute(
        'DELETE FROM whatsapp_devices WHERE id = :id AND user_id = :userId',
        { id, userId },
      );
      req.flash('success', 'Dispositivo removido.');
    } else if (action === 'toggle_bloqueio') {
      try {
        const device = await carregarDevice(userId, id);
        if (!device) throw new Error('Dispositivo não encontrado.');
        // Envia o estado desejado: repetir o POST não deve inverter a opção.
        const enabled = req.body.bloqueio_chamadas === '1';
        await syncBloqueioChamadas(device.sessao, enabled);
        await execute(
          'UPDATE whatsapp_devices SET bloqueio_chamadas = :enabled WHERE id = :id AND user_id = :userId',
          { enabled: enabled ? 1 : 0, id, userId },
        );
        req.flash(
          'success',
          enabled
            ? 'Bloqueio de chamadas ativado e confirmado pela API.'
            : 'Bloqueio de chamadas desativado e confirmado pela API.',
        );
      } catch (error) {
        req.flash(
          'error',
          `Não foi possível confirmar a alteração do bloqueio de chamadas. ${traduzirErroWhatsapp(error)}`,
        );
      }
    }
    return res.redirect('/whatsapp');
  } catch (error) {
    next(error);
  }
});
// Status de um dispositivo (ou do principal, p/ o indicador do topo). Usado em polling.
whatsappRouter.get('/whatsapp/status', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const id = Number(req.query.device);
    const device = id
      ? await carregarDevice(userId, id)
      : (await listarDevices(userId))[0];
    if (!device) return res.json({ status: 'desconectado', connected: false });
    const state = await getDeviceState(device.sessao);
    return res.json({ ...state, deviceId: device.id });
  } catch (error) {
    next(error);
  }
});
// Conectar (gera QR), parear pelo número, ou desconectar — AJAX JSON.
whatsappRouter.post('/whatsapp/device/:id/:op', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const device = await carregarDevice(userId, Number(req.params.id));
    if (!device)
      return res
        .status(404)
        .json({ status: 'erro', lastError: 'Dispositivo não encontrado.' });
    const op = String(req.params.op);
    if (op === 'connect') {
      await requestSessionApi(
        env.whatsapp.sessionStartPath,
        'POST',
        device.sessao,
      );
      try {
        await syncBloqueioChamadas(
          device.sessao,
          Boolean(device.bloqueioChamadas),
        );
      } catch (error) {
        return res.status(502).json({
          status: 'erro',
          lastError: `Não foi possível confirmar o bloqueio de chamadas: ${traduzirErroWhatsapp(error)}`,
        });
      }
      return res.json(await getDeviceState(device.sessao));
    }
    if (op === 'disconnect') {
      // Logout (não restart): manda o WhatsApp desvincular o aparelho da lista de
      // "Aparelhos vinculados" no celular E apaga as credenciais locais. Antes
      // chamava restart, que só fechava o socket — o celular continuava mostrando
      // a sessão como ativa e na próxima conexão reusava sem QR.
      await requestSessionApi(
        env.whatsapp.sessionLogoutPath,
        'POST',
        device.sessao,
      );
      return res.json({ status: 'desconectado', connected: false });
    }
    return res
      .status(400)
      .json({ status: 'erro', lastError: 'Operação inválida.' });
  } catch (error) {
    next(error);
  }
});
