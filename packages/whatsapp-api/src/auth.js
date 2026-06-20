import { timingSafeEqual } from "node:crypto";

export function requireToken(expectedToken) {
  if (!expectedToken) {
    console.warn("[whatsapp-api] API_TOKEN vazio — autenticação desativada (USE SÓ EM DEV).");
  }
  return function tokenMiddleware(req, res, next) {
    if (!expectedToken) return next();

    const headerToken = req.headers?.token;
    const authorization = req.headers?.authorization ?? "";
    const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const receivedToken = String(headerToken || bearerToken || "");

    // Comparação timing-safe — evita revelar o token por diferenças de tempo
    // em ataques de força bruta. Buffers de tamanhos diferentes nunca batem.
    const a = Buffer.from(receivedToken);
    const b = Buffer.from(expectedToken);
    if (a.length === b.length && timingSafeEqual(a, b)) return next();

    return res.status(401).json({ ok: false, error: "Token inválido ou ausente." });
  };
}
