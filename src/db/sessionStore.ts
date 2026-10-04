import session from "express-session";
import expressMySqlSession from "express-mysql-session";
import { env } from "../config/env.js";

const MySQLStore = expressMySqlSession(session);

// Guarda as sessões no MySQL em vez do MemoryStore padrão (que é volátil:
// derruba todo mundo a cada restart/deploy e vaza memória em produção).
// Cada middleware precisa da sua instância: express-session atribui store.generate
// com as opções de cookie. Compartilhar o objeto mistura os paths dos dois logins.
export function createSessionStore(): session.Store {
return env.localMode ? new session.MemoryStore() : new MySQLStore({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  compress: false,
  createDatabaseTable: true,
  charset: "utf8mb4_unicode_ci",
  // Remove sessões expiradas a cada 15 min.
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  // 30 dias, alinhado ao "lembrar de mim" do login.
  expiration: 30 * 24 * 60 * 60 * 1000,
});
}
