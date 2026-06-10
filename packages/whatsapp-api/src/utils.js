// Reexporta do pacote compartilhado (fonte única em packages/shared).
export { normalizeBrazilPhone } from "./shared/index.js";
import { normalizeBrazilPhone } from "./shared/index.js";

export function toJid(phone, defaultCountry = "55") {
  const value = String(phone ?? "").trim();
  if (value.includes("@")) return value;
  return `${normalizeBrazilPhone(value, defaultCountry)}@s.whatsapp.net`;
}

export function resolveSessionName(sessionName, defaultSession = "default") {
  const raw = String(sessionName || defaultSession || "default").trim().toLowerCase();
  const safe = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return safe || "default";
}
