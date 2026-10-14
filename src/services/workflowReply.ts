// Resultados independentes do servidor HTTP. O controller decide como enviá-los.
import type { WorkflowResponse } from '../../backend/src/features/workflow.types.ts';

export function createWorkflowReply(locals: Record<string, any> = {}) {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let result: WorkflowResponse = {
    kind: 'continue',
    status: statusCode,
    headers,
  };
  const complete = (
    kind: WorkflowResponse['kind'],
    data: Record<string, unknown>,
  ) => {
    result = {
      kind,
      status: statusCode,
      headers: { ...headers },
      ...data,
    } as WorkflowResponse;
    return result;
  };
  const reply = {
    locals,
    status(code) {
      statusCode = code;
      return reply;
    },
    set(name, value) {
      if (typeof name === 'object') Object.assign(headers, name);
      else headers[name] = value;
      return reply;
    },
    setHeader(name, value) {
      headers[name] = value;
      return reply;
    },
    type(value) {
      headers['Content-Type'] = value;
      return reply;
    },
    json(data) {
      return complete('json', { data });
    },
    render(view: string, data: Record<string, unknown> = {}) {
      return complete('view', { view, data });
    },
    redirect(code: number | string, path?: string) {
      statusCode = typeof code === 'number' ? code : 302;
      return complete('redirect', { path: path ?? code });
    },
    send(data) {
      return complete('send', { data });
    },
    sendStatus(code) {
      statusCode = code;
      return complete('status', {});
    },
    download(path) {
      return complete('download', { path });
    },
    get result() {
      return result;
    },
  };
  return reply;
}

export async function workflowResult(input, operation) {
  const reply = createWorkflowReply(input.locals);
  await operation(reply);
  return reply.result;
}

export function raiseWorkflowError(error?: unknown) {
  if (error) throw error;
}
