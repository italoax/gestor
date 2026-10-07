import session from 'express-session';
import expressMySqlSession from 'express-mysql-session';
import { env } from '../config/env.js';
const MySQLStore = expressMySqlSession(session);
const stores = new Set();
export async function closeSessionStores() {
  await Promise.all([...stores].map((store) => store.close()));
  stores.clear();
}
// Guarda as sessões no MySQL em vez do MemoryStore padrão (que é volátil:
// derruba todo mundo a cada restart/deploy e vaza memória em produção).
// Cada middleware precisa da sua instância: express-session atribui store.generate
// com as opções de cookie. Compartilhar o objeto mistura os paths dos dois logins.
export function createSessionStore() {
  if (env.localMode) return new session.MemoryStore();
  const store = new MySQLStore({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    connectionLimit: 3,
    queueLimit: 30,
    // The store does not forward compression options; mysql2 defaults to disabled.
    createDatabaseTable: true,
    charset: 'utf8mb4_unicode_ci',
    // Remove sessões expiradas a cada 15 min.
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    // 30 dias, alinhado ao "lembrar de mim" do login.
    expiration: 30 * 24 * 60 * 60 * 1000,
  });
  stores.add(store);
  return store;
}
