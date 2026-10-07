import webpush from 'web-push';
import { execute, queryRows } from '../db/mysql.js';
import { env } from '../config/env.js';
import { publicHttpsAgent, publicHttpsUrl } from './publicNetwork.js';
// Configura web-push uma vez no boot. Se as VAPID keys não estiverem setadas,
// pushDisponivel() retorna false e os call sites pulam o envio em vez de quebrar.
let configurado = false;
function configurar() {
  if (configurado) return;
  if (!env.push.publicKey || !env.push.privateKey) return;
  webpush.setVapidDetails(
    env.push.subject,
    env.push.publicKey,
    env.push.privateKey,
  );
  configurado = true;
}
export function pushDisponivel() {
  configurar();
  return configurado;
}
export function vapidPublicKey() {
  return env.push.publicKey;
}
/**
 * Envia push pra todos os devices de um usuário. Idempotente: se uma inscrição
 * estiver expirada (410 Gone), apaga do banco. Outros erros vão pro log.
 */
export async function enviarPushParaUsuario(userId, payload) {
  if (!pushDisponivel()) return { enviadas: 0, falhas: 0 };
  const subs = await queryRows(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = :userId`,
    { userId },
  );
  if (!subs.length) return { enviadas: 0, falhas: 0 };
  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/dashboard',
    tag: payload.tag,
    icon: payload.icon || '/icons/icon-192.png',
    badge: payload.badge || '/icons/badge-72.png',
  });
  let enviadas = 0,
    falhas = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        publicHttpsUrl(s.endpoint);
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          data,
          { TTL: 60 * 60 * 24, agent: publicHttpsAgent, timeout: 15000 },
        ); // 24h
        enviadas++;
      } catch (error) {
        falhas++;
        const status = error.statusCode;
        // 404/410: inscrição morta. Apaga pra não tentar de novo.
        if (status === 404 || status === 410) {
          await execute(`DELETE FROM push_subscriptions WHERE id = :id`, {
            id: s.id,
          });
        } else {
          console.warn(
            `[push] falha endpoint=${s.endpoint.slice(0, 60)}... status=${status}:`,
            error,
          );
        }
      }
    }),
  );
  return { enviadas, falhas };
}
