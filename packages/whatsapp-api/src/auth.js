export function requireToken(expectedToken) {
  return function tokenMiddleware(req, res, next) {
    if (!expectedToken) return next();

    const headerToken = req.headers?.token;
    const authorization = req.headers?.authorization ?? "";
    const bearerToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const receivedToken = String(headerToken || bearerToken || "");

    if (receivedToken === expectedToken) return next();

    return res.status(401).json({ ok: false, error: "Token inválido ou ausente." });
  };
}
