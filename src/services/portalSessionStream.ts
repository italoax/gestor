import type { Request, Response } from 'express';
import type { WorkflowResponse } from '../../apps/api/src/features/workflow.types.ts';

const listeners = new Map<number, Set<() => void>>();

export function notifyPortalAccessChanged(id: number) {
  for (const listener of listeners.get(id) || []) listener();
}

export async function servePortalSession(
  request: Request,
  response: Response,
  authorize: () => Promise<WorkflowResponse>,
) {
  response.set('Cache-Control', 'no-store, no-transform');
  const initial = await authorize();
  if (response.destroyed || response.writableEnded) return;
  if (initial.kind !== 'continue')
    return response.status(401).json({ active: false, redirect: '/' });
  if (request.query.check === '1') return response.json({ active: true });

  const id = request.session.cliente.id;
  response.set({
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.flushHeaders();
  let closed = false;
  let checking = false;
  let queued = false;
  const send = (event: string, data: unknown) => {
    if (closed) return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    response.flush?.();
  };
  const verify = async () => {
    if (closed) return;
    if (checking) {
      queued = true;
      return;
    }
    checking = true;
    try {
      do {
        queued = false;
        const result = await authorize();
        if (closed) return;
        if (result.kind !== 'continue') {
          await new Promise<void>((resolve, reject) =>
            request.session.save((error) =>
              error ? reject(error) : resolve(),
            ),
          );
          send('revoked', { redirect: '/' });
          response.end();
          cleanup();
          return;
        }
        send('session', { active: true });
      } while (queued && !closed);
    } catch {
      // Uma falha temporária fecha o stream; a reconexão revalida a sessão.
      response.end();
      cleanup();
    } finally {
      checking = false;
    }
  };
  const changed = () => {
    void verify();
  };
  const group = listeners.get(id) || new Set<() => void>();
  group.add(changed);
  listeners.set(id, group);
  const heartbeat = setInterval(changed, 15000);
  heartbeat.unref();
  // A reconexão passa novamente pelos limites de duração e inatividade da sessão.
  const lifetime = setTimeout(() => {
    response.end();
    cleanup();
  }, 60000);
  lifetime.unref();
  function cleanup() {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(lifetime);
    group.delete(changed);
    if (!group.size) listeners.delete(id);
  }
  response.once('close', cleanup);
  // Revalida após assinar para cobrir uma revogação durante a conexão inicial.
  await verify();
}
