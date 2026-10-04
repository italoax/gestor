import type { Request, Response, NextFunction } from "express";
import { invalidarDashboardCache } from "../routes/dashboard.js";

// Rotas cujo POST altera dados refletidos no dashboard. Lista explícita pra não
// invalidar à toa em rotas que não mudam nada (ex.: /whatsapp/status polling).
const ROTAS_QUE_AFETAM_DASHBOARD = [
  "/clientes",
  "/transacoes",
  "/planos",
  "/servidores",
  "/dispositivos",
  "/aplicativos",
];

export function invalidarCacheMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.method !== "POST") return next();
  if (!req.session?.user) return next();
  if (!ROTAS_QUE_AFETAM_DASHBOARD.includes(req.path)) return next();
  invalidarDashboardCache(req.session.user.id);
  return next();
}
