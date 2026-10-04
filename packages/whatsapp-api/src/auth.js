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

    // Sem token (ou inválido): finge que o serviço nem existe. Antes devolvia
    // 401 + JSON revelando "Token inválido ou ausente", o que entregava pra
    // qualquer scanner que aqui rodava uma API. Agora parece site comum 404.
    res.status(404)
      .set("Content-Type", "text/html; charset=utf-8")
      .send(`<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>404 Not Found</title></head>
<body>
  <h1>Not Found</h1>
  <p>The requested URL was not found on this server.</p>
</body>
</html>`);
  };
}
