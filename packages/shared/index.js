// Código compartilhado entre o painel (gestor) e a API de WhatsApp.
// Fonte ÚNICA: este arquivo é sincronizado para dentro de cada app
// (packages/<app>/src/shared/) pelo script scripts/sync-shared.mjs.

/**
 * Normaliza um telefone para apenas dígitos com DDI, no padrão brasileiro.
 * Remove máscara, prefixo internacional "00" e zeros à esquerda, e adiciona
 * o DDI quando faltar (assumindo Brasil/55 por padrão).
 * @param {string} phone Telefone digitado (com ou sem máscara).
 * @param {string} [defaultCountry] DDI padrão quando o número vier sem ele.
 * @returns {string} Apenas dígitos, ex.: "5511999998888".
 */
export function normalizeBrazilPhone(phone, defaultCountry = "55") {
  let digits = String(phone ?? "").replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");

  if (defaultCountry === "55" && !digits.startsWith("55") && (digits.length === 10 || digits.length === 11)) {
    return `55${digits}`;
  }

  if (!digits.startsWith(defaultCountry) && digits.length <= 11) {
    return `${defaultCountry}${digits}`;
  }

  return digits;
}
