import type { EventEmitter } from 'node:events';
import type { PoolConnection } from 'mysql2';

// O MySQL remoto encerra conexões ociosas em 20s. O ping do protocolo mantém
// as conexões livres reutilizáveis sem executar SQL ou interferir em transações.
export function keepIdleConnectionsAlive(pool: EventEmitter, interval = 10000) {
  const connections = new Map<
    PoolConnection,
    { idle: boolean; pinging: boolean; close: () => void }
  >();
  function connected(connection: PoolConnection) {
    if (connections.has(connection)) return;
    const state = { idle: false, pinging: false, close };
    const timer = setInterval(() => {
      if (!state.idle || state.pinging) return;
      state.pinging = true;
      try {
        connection.ping((error) => {
          state.pinging = false;
          if (error) {
            close();
            connection.destroy();
          }
        });
      } catch {
        close();
        connection.destroy();
      }
    }, interval);
    timer.unref();
    function close() {
      clearInterval(timer);
      connections.delete(connection);
      connection.off('end', close);
      connection.off('error', close);
    }
    connections.set(connection, state);
    connection.once('end', close);
    connection.once('error', close);
  }
  function acquired(connection: PoolConnection) {
    const state = connections.get(connection);
    if (state) state.idle = false;
  }
  function released(connection: PoolConnection) {
    const state = connections.get(connection);
    if (state) state.idle = true;
  }
  pool.on('connection', connected);
  pool.on('acquire', acquired);
  pool.on('release', released);
  return () => {
    pool.off('connection', connected);
    pool.off('acquire', acquired);
    pool.off('release', released);
    for (const state of connections.values()) state.close();
  };
}
