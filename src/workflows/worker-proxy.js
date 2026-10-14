import {
  workflowResult,
  raiseWorkflowError,
} from '../services/workflowReply.js';
export function createWorkerProxyWorkflow({
  env,
  fetch: requestFetch = globalThis.fetch,
}) {
  const fetch = requestFetch;

  return {
    run: (input) =>
      workflowResult(input, async (reply) => {
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
          raiseWorkflowError(error);
        }
      }),
  };
}
