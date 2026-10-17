import session from 'express-session';
import expressMySqlSession from 'express-mysql-session';
import { env } from '../config/env.ts';
import { db } from './mysql.ts';
import { safeError } from '../security/safeError.ts';
type MySQLSessionStore = Pick<session.Store, keyof session.Store> & {
  options: { checkExpirationInterval: number };
  clearExpiredSessions(): Promise<unknown>;
  close(): Promise<void>;
};
const MySQLStore = expressMySqlSession(session) as new (
  options: Record<string, unknown>,
  connection: typeof db,
) => MySQLSessionStore;
class PersistentSessionStore extends MySQLStore {
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private cleanupRunning = false;

  setExpirationInterval(interval = this.options.checkExpirationInterval) {
    this.clearExpirationInterval();
    this.cleanupTimer = setInterval(() => {
      if (this.cleanupRunning) return;
      this.cleanupRunning = true;
      void this.clearExpiredSessions()
        .catch((error) =>
          console.error('Falha ao limpar sessões expiradas:', safeError(error)),
        )
        .finally(() => {
          this.cleanupRunning = false;
        });
    }, interval);
    this.cleanupTimer.unref();
  }

  clearExpirationInterval() {
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = undefined;
  }
}
const stores = new Set<{ close(): Promise<void> }>();
export async function closeSessionStores() {
  await Promise.all([...stores].map((store) => store.close()));
  stores.clear();
}
// Guarda as sessões no MySQL em vez do MemoryStore padrão (que é volátil:
// derruba todo mundo a cada restart/deploy e vaza memória em produção).
// Cada middleware precisa da sua instância: express-session atribui store.generate
// com as opções de cookie. As instâncias compartilham somente o pool da aplicação.
export function createSessionStore() {
  if (env.localMode) return new session.MemoryStore();
  const store = new PersistentSessionStore(
    {
      createDatabaseTable: false,
      endConnectionOnClose: false,
      clearExpired: true,
      checkExpirationInterval: 15 * 60 * 1000,
      expiration: 8 * 60 * 60 * 1000,
    },
    db,
  );
  stores.add(store);
  return store;
}
