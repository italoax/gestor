// Bound both the response headers and body of external API requests.
// Financial POSTs are deliberately not retried: their outcome can be ambiguous.
export function fetchWithTimeout(url, init = {}, timeoutMs = 30000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  return fetch(url, { ...init, signal });
}
