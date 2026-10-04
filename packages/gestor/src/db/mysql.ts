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

// Executa um bloco em transação MySQL. Use quando há 2+ writes que precisam ser
// atômicos (ex.: INSERT cliente + UPDATE saldo de servidor + INSERT transação —
// se cair no meio, fica inconsistente sem isso).
export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    try { await conn.rollback(); } catch { /* connection já caiu */ }
    throw error;
  } finally {
    conn.release();
  }
}

// Hostinger derruba conexões inativas sem aviso (wait_timeout baixo). A primeira
// query depois disso falha, e a pool já cria outra conexão — só precisamos refazer.
// MAS: refazer um WRITE cegamente pode aplicá-lo 2× (INSERT duplicado, crédito
// descontado em dobro) se o erro veio DEPOIS de o servidor já ter executado.
// Por isso separamos os erros em dois grupos:

// Pré-execução: a conexão estava morta ANTES da query sair (o servidor nunca a
// executou). É o caso clássico do wait_timeout matando conexão ociosa. Seguro
// refazer QUALQUER query, inclusive write.
const ERROS_PRE_EXECUCAO = new Set([
  "PROTOCOL_CONNECTION_LOST",
]);
// Ambíguos: podem ter ocorrido DURANTE a execução. Só refazemos em LEITURA
// (idempotente). Num write, refazer poderia duplicar — então deixamos estourar.
const ERROS_AMBIGUOS = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ER_QUERY_INTERRUPTED",
]);

function ehErroRecuperavel(error: unknown, permitirAmbiguos: boolean): boolean {
  if (!error || typeof error !== "object") return false;
  const code = String((error as { code?: string }).code ?? "");
  if (ERROS_PRE_EXECUCAO.has(code)) return true;
  return permitirAmbiguos && ERROS_AMBIGUOS.has(code);
}

// idempotente=true (leituras): refaz em qualquer erro recuperável.
// idempotente=false (writes): refaz só quando é certo que o servidor não executou.
async function executarComRetry<T>(fn: () => Promise<T>, idempotente: boolean): Promise<T> {
  try { return await fn(); }
  catch (error) {
    if (!ehErroRecuperavel(error, idempotente)) throw error;
    // Pequeno delay antes do retry: dá tempo da pool reabrir a conexão.
    await new Promise((resolve) => setTimeout(resolve, 100));
    return fn();
  }
}

export async function queryRows<T extends RowDataPacket>(sql: string, params: NamedParams = {}) {
  return executarComRetry(async () => {
    const [rows] = await db.query<T[]>(sql, params as mysql.QueryOptions["values"]);
    return rows;
  }, true);
}

export async function queryOne<T extends RowDataPacket>(sql: string, params: NamedParams = {}) {
  const rows = await queryRows<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: NamedParams = {}) {
  return executarComRetry(async () => {
    const [result] = await db.execute<ResultSetHeader>(sql, params as any);
    return result;
  }, false);
}
