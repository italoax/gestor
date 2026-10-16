import { workflowResult } from '../services/workflowReply.ts';
import { safeError } from '../security/safeError.ts';
import { requestInternal } from '../frontend/backendTransport.ts';
import { automationsEnabled } from '../security/automationPolicy.ts';
export function createWorkerProxyWorkflow({
  env,
  fetch: requestFetch = (url, options) =>
    requestInternal(url, { ...options, socketPath: process.env.WORKER_SOCKET }),
}) {
  const fetch = requestFetch;

  return {
    run: (input) =>
      workflowResult(input, async (reply) => {
        if (!automationsEnabled(env))
          return reply
            .status(403)
            .json({ ok: false, error: 'Automações desativadas.' });
        try {
          const destination = new URL('/__cron/cobrancas', env.workerUrl);
          if (input.query.token)
            destination.searchParams.set('token', String(input.query.token));
          const response = await fetch(destination, {
            headers: { 'x-cron-token': input.get('x-cron-token') || '' },
            signal: AbortSignal.timeout(300000),
          });
          reply
            .set('Cache-Control', 'no-store')
            .status(response.status)
            .json(await response.json());
        } catch (error) {
          console.error('[cron] Worker indisponível:', safeError(error));
          reply.status(503).json({
            ok: false,
            error: 'Serviço de automações temporariamente indisponível.',
          });
        }
      }),
  };
}
