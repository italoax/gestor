import { queryOne } from "../db/mysql.js";
import type { RowDataPacket } from "mysql2";

// Config PIX estatica do dono do gestor, injetada nas mensagens via tag {pix}.
// Cache curto (60s) pra nao consultar o banco a cada envio no cron (que dispara
// muitas mensagens de um mesmo user em sequencia).

export interface PixConfig {
  pixChave: string | null;
  pixNome: string | null;
  pixTipo: string | null;
}

interface CacheEntry { valor: PixConfig; expira: number; }
const cache = new Map<number, CacheEntry>();
const TTL_MS = 60_000;

export async function getPixConfig(userId: number): Promise<PixConfig> {
  const agora = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expira > agora) return cached.valor;

  const row = await queryOne<RowDataPacket & { pixChave: string | null; pixNome: string | null; pixTipo: string | null }>(
    `SELECT pix_chave AS pixChave, pix_nome AS pixNome, pix_tipo AS pixTipo
       FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );
  const valor: PixConfig = {
    pixChave: row?.pixChave ?? null,
    pixNome: row?.pixNome ?? null,
    pixTipo: row?.pixTipo ?? null,
  };
  cache.set(userId, { valor, expira: agora + TTL_MS });
  return valor;
}

// Invalida o cache de um user (chamar quando ele salvar a chave em Minha Conta).
export function invalidarPixConfig(userId: number): void {
  cache.delete(userId);
}
