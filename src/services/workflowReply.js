// Resultados independentes do servidor HTTP. O controller decide como enviá-los.
export function createWorkflowReply(locals = {}) {
  let statusCode = 200;
  const headers = {};
  let result = { kind: 'continue', status: statusCode, headers };
  const complete = (kind, data) => {
    result = { kind, status: statusCode, headers: { ...headers }, ...data };
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
    render(view, data) {
      return complete('view', { view, data });
    },
    redirect(code, path) {
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

export function raiseWorkflowError(error) {
  if (error) throw error;
}
