const names = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AbortError',
  'TimeoutError',
]);
const codes = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EACCES',
  'ENOENT',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_NO_SUCH_TABLE',
  'ER_DATA_TOO_LONG',
  'ER_PARSE_ERROR',
  'ER_DUP_ENTRY',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
]);
export function safeError(error: any) {
  return {
    name: names.has(error?.name) ? error.name : 'Error',
    code: codes.has(error?.code) ? error.code : 'FAILED',
    ...(Number.isInteger(error?.statusCode) &&
    error.statusCode >= 400 &&
    error.statusCode <= 599
      ? { status: error.statusCode }
      : {}),
  };
}
