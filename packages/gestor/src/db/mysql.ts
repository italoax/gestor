import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { env } from "../config/env.js";

export const db = mysql.createPool({
  host: env.db.host,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  port: env.db.port,
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
  // dateStrings=true: o mysql2 devolve TIMESTAMP/DATETIME como string crua,
  // sem tentar converter pelo fuso do Node.js (que na Hostinger pode estar em
  // qualquer coisa). Quem precisa de conversão para Brasília formata na hora
  // de exibir (formatDateTimeBr trata strings cruas como horário do servidor MySQL).
  dateStrings: true,
  // Força a sessão MySQL pra UTC: assim CURRENT_TIMESTAMP, NOW() e leitura de
  // TIMESTAMP sempre devolvem o mesmo valor independente do fuso do servidor.
  timezone: "Z",
  charset: "utf8mb4",
});

// Garante que toda conexão nova da pool roda em UTC. Sem isso, CURRENT_TIMESTAMP
// e a leitura de TIMESTAMP dependem do fuso do servidor MySQL (em hospedagem
// compartilhada isso pode ser qualquer coisa), causando timestamps deslocados na
// aba de Disparos da Automação.
// O callback "connection" recebe a conexão CRUA (callback-style), não a versão
// promise — por isso usamos o callback aqui em vez de await/then.
db.on("connection", (conn) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (conn as any).query("SET time_zone = '+00:00'", () => {
    // Hospedagens onde o usuário não tem permissão para alterar o fuso da sessão
    // entram nesse erro — não é fatal: timestamps caem no fuso padrão do servidor.
  });
});

type NamedParams = Record<string, unknown>;

export async function queryRows<T extends RowDataPacket>(sql: string, params: NamedParams = {}) {
  const [rows] = await db.query<T[]>(sql, params as mysql.QueryOptions["values"]);
  return rows;
}

export async function queryOne<T extends RowDataPacket>(sql: string, params: NamedParams = {}) {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: NamedParams = {}) {
  const [result] = await db.execute<ResultSetHeader>(sql, params as any);
  return result;
}
