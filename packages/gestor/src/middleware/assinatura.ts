import type { Request, Response, NextFunction } from "express";
import { getStatusAssinatura } from "../services/assinatura.js";

// Rotas que continuam acessiveis mesmo com assinatura vencida.
// Inclui /meu-plano* (pra renovar), /logout (sair), /push* (manter
// notificacoes), /__cron* (cron externo) e endpoints de status.
const ROTAS_LIBERADAS = [
  /^\/meu-plano(\/|$)/,
  /^\/logout$/,
  /^\/push(\/|$)/,
  /^\/__cron/,
  /^\/notificacoes/,
  /^\/whatsapp\/status/,
];

export async function bloqueioAssinaturaMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.user?.id) return next();
  if (ROTAS_LIBERADAS.some((re) => re.test(req.path))) return next();
  try {
    const status = await getStatusAssinatura(req.session.user.id);
    if (status.bloqueado) {
      // AJAX: devolve 402 (Payment Required) com a URL pra renovar.
      if (req.xhr || req.accepts("html") !== "html") {
        return res.status(402).json({ ok: false, error: "Assinatura vencida.", redirect: "/meu-plano" });
      }
      return res.redirect("/meu-plano");
    }
    return next();
  } catch (error) {
    console.error("[bloqueioAssinatura]", error);
    return next();
  }
}
