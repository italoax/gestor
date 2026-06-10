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
  dateStrings: false,
  charset: "utf8mb4",
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
