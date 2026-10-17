import { safeError } from '../security/safeError.ts';
import { automationsEnabled } from '../security/automationPolicy.ts';
import crypto from 'node:crypto';
import { workflowResult } from '../services/workflowReply.ts';
export function createCronWorkflow({
  env,
  executarCobrancasAutomaticas,
  executarAgendados,
  rodarBackupAgendado,
}) {
  return {
    run: (input) =>
      workflowResult(input, async (reply) => {
        if (!automationsEnabled(env))
          return reply.status(403).json({
            ok: false,
            error: 'Automações desativadas pela configuração do ambiente.',
          });
        // Validação timing-safe do token — bate o tamanho primeiro pra não vazar info.
        const received = String(
          input.query.token ?? input.headers['x-cron-token'] ?? '',
        );
        const expected = env.cronToken;
        if (!expected)
          return reply
            .status(401)
            .json({ ok: false, error: 'CRON_TOKEN não configurado.' });
        const a = Buffer.from(received);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
          return reply
            .status(401)
            .json({ ok: false, error: 'Token inválido.' });
        }
        const start = Date.now();
        try {
          const result = await executarCobrancasAutomaticas();
          if (result.skipped)
            return reply.json({
              ok: true,
              skipped: true,
              reason: 'ja rodando',
            });
          // Aproveita o mesmo tick pra publicar status agendados vencidos.
          const statusResult = await executarAgendados();
          // Backup diário independente da publicação de status.
          await rodarBackupAgendado().catch(() => {});
          reply.json({
            ok: true,
            durationMs: Date.now() - start,
            statusPostados: statusResult.postados ?? 0,
          });
        } catch (error) {
          console.error('[cron] Falha na execução:', safeError(error));
          reply
            .status(500)
            .json({ ok: false, error: 'Erro ao executar as automações.' });
        }
      }),
  };
}
