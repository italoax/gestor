import { queryOne } from '../db/mysql.js';
const cache = new Map();
const TTL_MS = 60000;
export async function getPixConfig(userId) {
  const agora = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expira > agora) return cached.valor;
  const row = await queryOne(
    `SELECT pix_chave AS pixChave, pix_nome AS pixNome, pix_tipo AS pixTipo
       FROM users WHERE id = :userId LIMIT 1`,
    { userId },
  );
  const valor = {
    pixChave: row?.pixChave ?? null,
    pixNome: row?.pixNome ?? null,
    pixTipo: row?.pixTipo ?? null,
  };
  cache.set(userId, { valor, expira: agora + TTL_MS });
  return valor;
}
// Invalida o cache de um user (chamar quando ele salvar a chave em Minha Conta).
export function invalidarPixConfig(userId) {
  cache.delete(userId);
}
