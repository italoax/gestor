const APP_TIME_ZONE = "America/Sao_Paulo";

function saoPauloParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

export function appTodayIso(date = new Date()) {
  const parts = saoPauloParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function appNowSql(date = new Date()) {
  const parts = saoPauloParts(date);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

// "HH:MM" no fuso de São Paulo, para comparar com cobrancas.hora_envio.
export function appHhmm(date = new Date()) {
  const parts = saoPauloParts(date);
  return `${parts.hour}:${parts.minute}`;
}

// Dia da semana 0..6 (Dom..Sáb) no fuso de São Paulo.
export function appWeekday(date = new Date()) {
  const parts = saoPauloParts(date);
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
}
