// Declaração de tipos mínima para 'express-mysql-session'.
// Evita depender de @types/express-mysql-session (que ficaria em devDependencies
// e não é instalado no build de produção da Hostinger, quebrando o tsc).
declare module "express-mysql-session" {
  import session from "express-session";

  interface MySQLStoreClass {
    new (options: Record<string, unknown>, connection?: unknown): session.Store;
  }

  export default function expressMySqlSession(sess: unknown): MySQLStoreClass;
}
