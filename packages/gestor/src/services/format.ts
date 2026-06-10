import { Decimal } from "decimal.js";

export function formatMoney(value: unknown) {
  const decimal = new Decimal(Number(value ?? 0));
  return decimal.toNumber().toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDateBr(value: unknown) {
  if (!value) return "-";
  if (value instanceof Date) {
    return `${pad2(value.getUTCDate())}/${pad2(value.getUTCMonth() + 1)}/${value.getUTCFullYear()}`;
  }
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (br) return `${br[1]}/${br[2]}/${normalizeYear(br[3])}`;
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return `${pad2(date.getUTCDate())}/${pad2(date.getUTCMonth() + 1)}/${date.getUTCFullYear()}`;
}

export function formatDateInput(value: unknown) {
  if (!value) return "";
  if (value instanceof Date) return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const normalized = normalizeDateInput(text);
  if (normalized) return normalized;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeYear(year: string) {
  return year.length === 2 ? `20${year}` : year;
}

function isValidDateParts(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function normalizeDateInput(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    return isValidDateParts(year, month, day) ? `${iso[1]}-${iso[2]}-${iso[3]}` : "";
  }

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{2}|\d{4})$/);
  if (!br) return "";

  const yearText = normalizeYear(br[3]);
  const year = Number(yearText);
  const month = Number(br[2]);
  const day = Number(br[1]);
  return isValidDateParts(year, month, day) ? `${yearText}-${pad2(month)}-${pad2(day)}` : "";
}

function dateOnlyMs(value: unknown) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  }

  const normalized = normalizeDateInput(value);
  if (normalized) {
    const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function statusByVencimento(status: string, vencimento: unknown, now: Date = new Date()) {
  const lower = String(status ?? "").toLowerCase();
  if (lower === "inativo") return { label: "Inativo", color: "muted", type: "inativo" };

  const vencMs = dateOnlyMs(vencimento);
  if (vencMs === null) return { label: "Ativo", color: "green", type: "nao-vencido" };

  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((vencMs - todayMs) / 86400000);

  if (days < 0) return { label: "Vencido", color: "red", type: "vencido" };
  if (days === 0) return { label: "Vence hoje", color: "yellow", type: "today" };
  if (days === 1) return { label: "Vence amanhã", color: "yellow", type: "nao-vencido" };
  if (days <= 3) return { label: `${days} dias pra vencer`, color: "yellow", type: "nao-vencido" };
  return { label: "Ativo", color: "green", type: "nao-vencido" };
}

export function badgeStatusByVencimento(status: string, vencimento: unknown) {
  const current = statusByVencimento(status, vencimento);
  return `<span class="badge badge-${current.color}">${current.label}</span>`;
}

export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableString(value: unknown) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

export function boolField(value: unknown) {
  return value === "1" || value === "on" || value === "true" || value === true ? 1 : 0;
}
