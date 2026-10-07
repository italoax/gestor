import { Router } from 'express';
import { execute } from '../db/mysql.js';
import { vapidPublicKey, pushDisponivel } from '../services/push.js';
import { publicHttpsUrl } from '../services/publicNetwork.js';
export const pushRouter = Router();
// Front pega a chave pública pra fazer subscribe(). Não é segredo.
pushRouter.get('/push/public-key', (_req, res) => {
  res.json({ ok: true, key: vapidPublicKey(), enabled: pushDisponivel() });
});
// Registra ou atualiza uma inscrição do navegador atual.
// Body: { endpoint, keys: { p256dh, auth }, userAgent? }
// ON DUPLICATE: se já existe pelo endpoint, atualiza keys (rotação ocasional do browser).
pushRouter.post('/push/subscribe', async (req, res, next) => {
  try {
    const userId = req.session.user.id;
    const sub = req.body;
    const endpoint = String(sub?.endpoint ?? '');
    const p256dh = String(sub?.keys?.p256dh ?? '');
    const auth = String(sub?.keys?.auth ?? '');
    if (!endpoint || !p256dh || !auth)
      return res.status(400).json({ ok: false, error: 'Inscrição inválida.' });
    try {
      publicHttpsUrl(endpoint);
    } catch {
      return res
        .status(400)
        .json({ ok: false, error: 'Endpoint push inválido.' });
    }
    const ua = String(req.get('user-agent') ?? '').slice(0, 250);
    await execute(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
       VALUES (:userId, :endpoint, :p256dh, :auth, :ua)
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth), user_agent = VALUES(user_agent)`,
      { userId, endpoint, p256dh, auth, ua },
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
pushRouter.post('/push/unsubscribe', async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint ?? '');
    if (!endpoint)
      return res
        .status(400)
        .json({ ok: false, error: 'endpoint obrigatório.' });
    await execute(
      `DELETE FROM push_subscriptions WHERE endpoint = :endpoint AND user_id = :userId`,
      { endpoint, userId: req.session.user.id },
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
