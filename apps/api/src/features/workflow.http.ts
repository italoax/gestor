import type { Request, Response } from 'express';
import type {
  WorkflowInput,
  WorkflowResponse,
  WorkflowSession,
} from './workflow.types.ts';

export function workflowInput(
  request: Request,
  response: Response,
): WorkflowInput {
  const source = request as Request & {
    session: WorkflowSession;
    flash(type: string, message?: string): string[];
    file?: WorkflowInput['file'];
  };
  return {
    body: source.body ?? {},
    query: source.query,
    params: source.params as Record<string, string>,
    headers: source.headers,
    locals: response.locals,
    // Regenerate substitui a sessão: leia sempre a versão atual.
    get session() {
      return source.session;
    },
    file: source.file,
    get: (name) => source.get(name),
    flash: (type, message) =>
      message === undefined ? source.flash(type) : source.flash(type, message),
  };
}

export function sendWorkflowResponse(
  response: Response,
  result: WorkflowResponse,
): void {
  response.set(result.headers);
  response.status(result.status);
  switch (result.kind) {
    case 'json':
      response.json(result.data);
      return;
    case 'view':
      response.render(result.view, result.data);
      return;
    case 'redirect':
      response.redirect(result.status, result.path);
      return;
    case 'download':
      response.download(result.path);
      return;
    case 'send':
      response.send(result.data);
      return;
    case 'status':
      response.sendStatus(result.status);
      return;
    case 'continue':
      throw new Error('Fluxo sem resposta HTTP.');
  }
}
