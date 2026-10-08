import crypto from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { db } from '../db/mysql.js';
import { executarCobrancasAutomaticas } from '../services/cobrancasCron.js';
import { executarAgendados } from '../services/statusCron.js';
import { rodarBackupAgendado } from '../services/backup.js';

export const healthRouter = Router();
export const cronRouter = Router();

// Health check público pra monitor externo (UptimeRobot, etc). Inclui ping
// rápido no DB pra distinguir "Node tá vivo" de "Node + banco tá vivo".
healthRouter.get('/healthz', async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let dbOk = false;
  try {
    await db.query({ sql: 'SELECT 1', timeout: 5000 });
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const status = dbOk ? 200 : 503;
  res.status(status).json({
    ok: dbOk,
    db: dbOk ? 'ok' : 'down',
    uptimeSec: Math.round(process.uptime()),
    version: process.env.npm_package_version || '0.1.0',
  });
});

// Endpoint público (protegido por token) para um cron externo (Hostinger Cron Job
// ou cron-job.org) acordar o processo e disparar a execução das cobranças.
// Em shared hosting o processo Node hiberna sem tráfego — o setInterval interno só
// roda se alguém estiver acessando o site. Pingar essa rota a cada minuto resolve.
// O lock contra execução concorrente está dentro de executarCobrancasAutomaticas().
cronRouter.get('/__cron/cobrancas', async (req, res) => {
  if (env.localMode)
    return res
      .status(403)
      .json({ ok: false, error: 'Automações desativadas no modo local.' });
  // Validação timing-safe do token — bate o tamanho primeiro pra não vazar info.
  const received = String(req.query.token ?? req.headers['x-cron-token'] ?? '');
  const expected = env.cronToken;
  if (!expected)
    return res
      .status(401)
      .json({ ok: false, error: 'CRON_TOKEN não configurado.' });
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: 'Token inválido.' });
  }
  const start = Date.now();
  try {
    const result = await executarCobrancasAutomaticas();
    if (result.skipped)
      return res.json({ ok: true, skipped: true, reason: 'ja rodando' });
    // Aproveita o mesmo tick pra publicar status agendados vencidos.
    const statusResult = await executarAgendados();
    // Backup diário independente da publicação de status.
    await rodarBackupAgendado().catch(() => {});
    res.json({
      ok: true,
      durationMs: Date.now() - start,
      statusPostados: statusResult.postados ?? 0,
    });
  } catch (error) {
    console.error('[cron] Falha na execução:', error);
    res
      .status(500)
      .json({ ok: false, error: 'Erro ao executar as automações.' });
  }
});
