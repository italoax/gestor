// Deriva localização (estado/país) a partir do DDD do telefone do cliente.
// Não há coluna de UF/país no cadastro, então usamos o DDD como aproximação.

const DDD_UF: Record<string, string> = {
  "11": "SP", "12": "SP", "13": "SP", "14": "SP", "15": "SP", "16": "SP", "17": "SP", "18": "SP", "19": "SP",
  "21": "RJ", "22": "RJ", "24": "RJ",
  "27": "ES", "28": "ES",
  "31": "MG", "32": "MG", "33": "MG", "34": "MG", "35": "MG", "37": "MG", "38": "MG",
  "41": "PR", "42": "PR", "43": "PR", "44": "PR", "45": "PR", "46": "PR",
  "47": "SC", "48": "SC", "49": "SC",
  "51": "RS", "53": "RS", "54": "RS", "55": "RS",
  "61": "DF",
  "62": "GO", "64": "GO",
  "63": "TO",
  "65": "MT", "66": "MT",
  "67": "MS",
  "68": "AC",
  "69": "RO",
  "71": "BA", "73": "BA", "74": "BA", "75": "BA", "77": "BA",
  "79": "SE",
  "81": "PE", "87": "PE",
  "82": "AL",
  "83": "PB",
  "84": "RN",
  "85": "CE", "88": "CE",
  "86": "PI", "89": "PI",
  "91": "PA", "93": "PA", "94": "PA",
  "92": "AM", "97": "AM",
  "95": "RR",
  "96": "AP",
  "98": "MA", "99": "MA",
};

export const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
  MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

// Códigos de país (ISO alpha-2) -> nome em pt-BR, para o mapa-múndi.
export const PAIS_NOME: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", CA: "Canadá", MX: "México",
  AR: "Argentina", CL: "Chile", CO: "Colômbia", VE: "Venezuela", PE: "Peru", UY: "Uruguai", PY: "Paraguai", BO: "Bolívia", EC: "Equador",
  PT: "Portugal", ES: "Espanha", FR: "França", GB: "Reino Unido", IE: "Irlanda",
  DE: "Alemanha", IT: "Itália", NL: "Países Baixos", BE: "Bélgica", CH: "Suíça", AT: "Áustria",
  SE: "Suécia", NO: "Noruega", DK: "Dinamarca", FI: "Finlândia", PL: "Polônia",
  RU: "Rússia", UA: "Ucrânia", TR: "Turquia", IL: "Israel", AE: "Emirados Árabes", SA: "Arábia Saudita",
  IN: "Índia", CN: "China", JP: "Japão", KR: "Coreia do Sul",
  AU: "Austrália", NZ: "Nova Zelândia", ZA: "África do Sul",
  AO: "Angola", MZ: "Moçambique", CV: "Cabo Verde",
};

// Códigos de país (DDI) -> ISO alpha-2. Listado por tamanho decrescente —
// "351" (PT) precisa ser checado antes de "35" (Macedônia, hoje "389"), etc.
// Mantemos só os comuns; números desconhecidos caem como null e somem do mapa.
const DDI_PAIS: Array<[string, string]> = [
  ["351", "PT"], ["353", "IE"], ["852", "HK"], ["886", "TW"], ["971", "AE"], ["972", "IL"],
  ["244", "AO"], ["258", "MZ"], ["238", "CV"], ["966", "SA"],
  ["49", "DE"], ["33", "FR"], ["34", "ES"], ["39", "IT"], ["31", "NL"], ["32", "BE"], ["41", "CH"], ["43", "AT"],
  ["44", "GB"], ["45", "DK"], ["46", "SE"], ["47", "NO"], ["48", "PL"], ["358", "FI"],
  ["52", "MX"], ["54", "AR"], ["56", "CL"], ["57", "CO"], ["58", "VE"], ["51", "PE"], ["598", "UY"], ["595", "PY"], ["591", "BO"], ["593", "EC"],
  ["55", "BR"],
  ["81", "JP"], ["82", "KR"], ["86", "CN"], ["91", "IN"], ["61", "AU"], ["64", "NZ"],
  ["7", "RU"], ["90", "TR"], ["380", "UA"], ["27", "ZA"],
  ["1", "US"], // "1" também é Canadá; sem outra heurística, atribui US.
];

// Extrai só os dígitos do telefone, removendo + e zeros à esquerda.
function digitos(telefone: string | null | undefined): string {
  const d = String(telefone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  return d;
}

// Heurística: número é brasileiro quando
//   - tem 10 ou 11 dígitos (DDD + número, sem DDI) — formato típico salvo no Brasil; OU
//   - tem 12 ou 13 dígitos começando com "55" (DDI + DDD + número).
// Tudo mais é tratado como internacional. Antes assumíamos BR sempre que não
// começava com 55 — números de Londres ("44...") caíam como DDD 44 = PR.
function ehBrasileiro(d: string): boolean {
  if (d.length === 10 || d.length === 11) return true;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return true;
  return false;
}

// Extrai o DDD (2 dígitos) só quando o número é claramente brasileiro.
// Internacionais retornam null (não tentamos mapear pra UF).
export function dddFromTelefone(telefone: string | null | undefined): string | null {
  const d = digitos(telefone);
  if (!d || !ehBrasileiro(d)) return null;
  const semDDI = d.startsWith("55") && (d.length === 12 || d.length === 13) ? d.slice(2) : d;
  return semDDI.slice(0, 2);
}

export function ufFromTelefone(telefone: string | null | undefined): string | null {
  const ddd = dddFromTelefone(telefone);
  return ddd ? DDD_UF[ddd] ?? null : null;
}

// País derivado do telefone:
//   - brasileiro detectado -> BR.
//   - senão, tenta casar com DDI de país conhecido (44 -> GB, 351 -> PT, etc).
// Como "1" é um DDI muito ambíguo, deixamos por último (e cobre só US/CA — o
// usuário vai ter quase nenhum cliente lá no contexto desse app).
export function paisFromTelefone(telefone: string | null | undefined): string | null {
  const d = digitos(telefone);
  if (!d) return null;
  if (ehBrasileiro(d)) return "BR";
  for (const [ddi, iso] of DDI_PAIS) {
    if (d.startsWith(ddi)) return iso;
  }
  return null;
}
