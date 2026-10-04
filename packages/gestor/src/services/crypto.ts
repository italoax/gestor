import crypto from "node:crypto";
import { env } from "../config/env.js";

// Criptografia simétrica (AES-256-GCM) para guardar segredos no banco — hoje a
// senha do painel Sigma da integração. NUNCA guardamos senha em texto puro.
//
// A chave de 32 bytes é derivada do SESSION_SECRET (SHA-256), pra não exigir uma
// env var nova no deploy. Em produção o SESSION_SECRET já é forte (>=32 chars,
// validado no env.ts). Se o SESSION_SECRET mudar, os segredos antigos ficam
// ilegíveis (decrypt devolve "") — basta recadastrar a integração.
const KEY = crypto.createHash("sha256").update(String(env.sessionSecret)).digest();

// Formato do valor guardado: base64(iv).base64(authTag).base64(ciphertext)
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plain ?? ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(stored: string): string {
  if (!stored) return "";
  const parts = String(stored).split(".");
  if (parts.length !== 3) return ""; // valor inválido/legado — trata como vazio
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return ""; // chave errada / dado corrompido
  }
}
