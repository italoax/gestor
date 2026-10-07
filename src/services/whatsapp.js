import { env } from '../config/env.js';
import { normalizeBrazilPhone } from '../shared/index.js';
import { tokenDoCliente, urlPagamentoDoCliente } from './linkCliente.js';
import { caminhoPagamento } from './linkPagamentoUrl.js';
function replaceSession(path, sessao) {
  const session = encodeURIComponent(
    sessao || env.whatsapp.sessionNameDefault || 'default',
  );
  // Aceita variações comuns digitadas no painel: {session}, \\{session\\}, :session e [session].
  return path
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\{\s*session\s*\}/gi, session)
    .replace(/:session\b/gi, session)
    .replace(/\[\s*session\s*\]/gi, session);
}
function traduzirErroWhatsapp(error) {
  const message = String(
    error instanceof Error ? error.message : (error ?? ''),
  ).trim();
  if (!message) return '';
  if (
    /fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|network/i.test(
      message,
    )
  ) {
    return 'Não foi possível conectar à API do WhatsApp.';
  }
  if (/unauthorized|forbidden|invalid token|token/i.test(message)) {
    return 'Token da API do WhatsApp inválido ou ausente.';
  }
  if (/not found|Cannot GET|Cannot POST/i.test(message)) {
    return 'Endpoint da API do WhatsApp não encontrado.';
  }
  if (/QR refs attempts ended/i.test(message)) {
    return 'O QR Code expirou. Gere um novo QR Code e tente novamente.';
  }
  return message;
}
// Timeout do fetch pro microserviço WhatsApp. 30s cobre o caso normal (resolveJid
// + composing 800-3500ms + send), e aborta cedo se o serviço travou — antes,
// um fetch sem timeout pendurava a request do painel até o WhatsApp responder
// (podia ser 60s+), travando o cron e o submit do formulário.
const WHATSAPP_FETCH_TIMEOUT_MS = 30000;
async function jsonRequest(
  url,
  payload,
  method = 'POST',
  headers = {},
  timeoutMs = WHATSAPP_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : JSON.stringify(payload ?? {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (
      !response.ok ||
      (typeof data === 'object' && data !== null && data.ok === false)
    ) {
      const json = typeof data === 'object' && data !== null ? data : {};
      return {
        ok: false,
        status: response.status,
        response: data,
        error:
          traduzirErroWhatsapp(json.error ?? json.lastError) ||
          `Erro HTTP ${response.status}`,
      };
    }
    const json = typeof data === 'object' && data !== null ? data : null;
    const messages = Array.isArray(json?.messages) ? json.messages : [];
    const messageId = String(messages[0]?.id ?? json?.key?.id ?? '');
    return { ok: true, status: response.status, response: data, messageId };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      error: aborted
        ? `Timeout: a API do WhatsApp não respondeu em ${timeoutMs / 1000}s.`
        : traduzirErroWhatsapp(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
export function normalizarTelefone(telefone) {
  return normalizeBrazilPhone(telefone, env.whatsapp.defaultCountry);
}
export function montarMensagem(template, cliente) {
  // Vencimento: aceita Date OU string ISO ("YYYY-MM-DD" do MySQL DATE).
  // Sempre devolve "DD/MM/YYYY" — antes saía "2026-06-19" no template quando
  // o banco entregava string crua (depois do dateStrings: true).
  let vencimento = '';
  if (cliente.vencimento instanceof Date) {
    vencimento = cliente.vencimento.toLocaleDateString('pt-BR', {
      timeZone: 'UTC',
    });
  } else if (cliente.vencimento) {
    const raw = String(cliente.vencimento).trim();
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    vencimento = iso ? `${iso[3]}/${iso[2]}/${iso[1]}` : raw;
  }
  const valor = Number(cliente.valor ?? 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
  const horaSp = Number(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      hour12: false,
    }).format(new Date()),
  );
  const saudacao =
    horaSp < 12 ? 'Bom dia' : horaSp < 18 ? 'Boa tarde' : 'Boa noite';
  const nomeCompleto = String(cliente.nome ?? '').trim();
  // Link de pagamento: monta a URL pública /pagar/<token> quando o cliente já
  // tem token gerado. Sem token, devolve string vazia (template fica sem o link
  // em vez de mostrar "{link_pagamento}" cru). O token é setado quando o user
  // clica em "Copiar link de pagamento" pela primeira vez, ou pode ser gerado
  // antecipadamente no cadastro se quiser.
  const pagamentoToken = String(
    cliente.pagamentoToken ?? cliente.pagamento_token ?? '',
  );
  const linkPagamento = String(
    cliente.linkPagamentoCurto ||
      (pagamentoToken
        ? `${env.appUrl.replace(/\/$/, '')}${caminhoPagamento(pagamentoToken)}`
        : ''),
  );
  // Chave PIX estatica do dono do gestor. Os call sites enriquecem o cliente
  // com pixChave/pixNome/pixTipo (config do user). {pix} devolve a chave crua,
  // que o WhatsApp deixa o cliente copiar com toque longo. {pix_bloco} monta um
  // bloco pronto (Nome + tipo + chave em linha isolada) pra facilitar.
  const c = cliente;
  const pixChave = String(c.pixChave ?? c.pix_chave ?? '').trim();
  const pixNome = String(c.pixNome ?? c.pix_nome ?? '').trim();
  const pixTipo = String(c.pixTipo ?? c.pix_tipo ?? '').trim();
  let pixBloco = '';
  if (pixChave) {
    const linhas = [];
    if (pixNome) linhas.push(`*${pixNome}*`);
    linhas.push(`${pixTipo ? pixTipo + ': ' : ''}${pixChave}`);
    pixBloco = linhas.join('\n');
  }
  const acessos = Array.isArray(c.acessosCobranca) ? c.acessosCobranca : [];
  const dataAcesso = (value) => {
    if (value instanceof Date)
      return value.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
    const raw = String(value ?? '');
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : raw;
  };
  const tags = {
    resumo_acessos: String(c.resumo_acessos ?? ''),
    vencimento_1: dataAcesso(acessos[0]?.vencimento ?? cliente.vencimento),
    vencimento_2: dataAcesso(acessos[1]?.vencimento),
    nome: nomeCompleto,
    nome_completo: nomeCompleto,
    primeiro_nome: nomeCompleto.split(/\s+/)[0] ?? '',
    cliente: nomeCompleto,
    saudacao,
    senha: String(cliente.senha ?? ''),
    vencimento,
    valor,
    plano: String(cliente.plano ?? ''),
    usuario: String(cliente.user ?? ''),
    user: String(cliente.user ?? ''),
    telefone: String(cliente.telefone ?? ''),
    servidor: String(cliente.servidor ?? ''),
    link_pagamento: linkPagamento,
    link_cliente: linkPagamento,
    pagamento: linkPagamento,
    link: linkPagamento,
    pix: pixChave,
    chave_pix: pixChave,
    pix_nome: pixNome,
    pix_tipo: pixTipo,
    pix_bloco: pixBloco,
  };
  return template
    .replace(/\{([^}]+)\}/g, (_, key) => {
      const normalizedKey = key
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
      return tags[normalizedKey] ?? '';
    })
    .replace(/\r\n/g, '\n');
}
export function resolverUrlMidia(caminho) {
  const trimmed = caminho.trim();
  if (!trimmed) return '';
  // http(s) E data: já são absolutas — passam direto. O prefixo de APP_URL só
  // vale pra caminho relativo de upload (ex.: "/uploads/x.jpg"). Sem tratar o
  // data: aqui, um Status agendado (imagem/vídeo) virava "https://app/data:..."
  // — o microserviço não conseguia buscar a mídia e o status nunca publicava.
  if (/^(https?:|data:)/i.test(trimmed)) return trimmed;
  return `${env.appUrl.replace(/\/$/, '')}/${trimmed.replace(/^\//, '')}`;
}
function sessionUrl(pathTemplate, sessao) {
  if (!env.whatsapp.sessionApiUrl) return '';
  const path = replaceSession(pathTemplate, sessao);
  return `${env.whatsapp.sessionApiUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
function sessionHeaders(token) {
  const resolvedToken = (token ?? env.whatsapp.sessionApiToken).trim();
  return resolvedToken
    ? { Authorization: `Bearer ${resolvedToken}`, token: resolvedToken }
    : {};
}
export async function enviarTexto(sessao, telefone, mensagem, token) {
  const to = normalizarTelefone(telefone);
  const url = sessionUrl(
    env.whatsapp.sessionSendTextPath,
    sessao || env.whatsapp.sessionNameDefault,
  );
  if (!url) return { ok: false, error: 'WA_SESSION_API_URL ausente.' };
  return jsonRequest(
    url,
    {
      session: sessao || env.whatsapp.sessionNameDefault,
      number: to,
      body: mensagem,
    },
    'POST',
    sessionHeaders(token),
  );
}
export async function enviarMidia(
  sessao,
  telefone,
  urlMidia,
  tipo,
  caption = '',
  token,
) {
  const to = normalizarTelefone(telefone);
  const urlPublica = resolverUrlMidia(urlMidia);
  const url = sessionUrl(
    env.whatsapp.sessionSendMediaPath,
    sessao || env.whatsapp.sessionNameDefault,
  );
  if (!url) return { ok: false, error: 'WA_SESSION_API_URL ausente.' };
  return jsonRequest(
    url,
    {
      session: sessao || env.whatsapp.sessionNameDefault,
      number: to,
      mediaUrl: urlPublica,
      caption,
      type: tipo,
    },
    'POST',
    sessionHeaders(token),
  );
}
export async function enviarAudio(sessao, telefone, urlAudio, token) {
  const to = normalizarTelefone(telefone);
  const urlPublica = resolverUrlMidia(urlAudio);
  const url = sessionUrl(
    env.whatsapp.sessionSendAudioPath,
    sessao || env.whatsapp.sessionNameDefault,
  );
  if (!url) return { ok: false, error: 'WA_SESSION_API_URL ausente.' };
  return jsonRequest(
    url,
    {
      session: sessao || env.whatsapp.sessionNameDefault,
      number: to,
      mediaUrl: urlPublica,
    },
    'POST',
    sessionHeaders(token),
  );
}
// Publica um Status (story) do WhatsApp via microserviço Baileys.
// O endpoint /api/status/send aceita texto com cor de fundo OU mídia (imagem/vídeo).
export async function postarStatus(sessao, payload, token) {
  const url = sessionUrl(
    '/api/status/send',
    sessao || env.whatsapp.sessionNameDefault,
  );
  if (!url) return { ok: false, error: 'WA_SESSION_API_URL ausente.' };
  const body = {
    session: sessao || env.whatsapp.sessionNameDefault,
    type: payload.type,
  };
  if (payload.type === 'text') {
    body.text = String(payload.text ?? '').trim();
    if (payload.backgroundColor) body.backgroundColor = payload.backgroundColor;
    if (payload.font != null) body.font = payload.font;
  } else {
    body.mediaUrl = resolverUrlMidia(String(payload.mediaUrl ?? ''));
    if (payload.caption) body.caption = payload.caption;
  }
  return jsonRequest(url, body, 'POST', sessionHeaders(token), 180000);
}
export async function enviarMensagemModelo(
  sessao,
  cliente,
  modelo,
  token,
  pix,
) {
  // Enriquece o cliente com a config PIX do user (se passada) pra a tag {pix}
  // e derivadas funcionarem. Nao muta o objeto original.
  const clienteFinal = { ...cliente, ...pix };
  if (
    /\{(?:link_cliente|link_pagamento|pagamento|link)\}/i.test(
      modelo.mensagem || '',
    ) &&
    Number.isSafeInteger(Number(cliente.id)) &&
    Number(cliente.id) > 0
  ) {
    const url = await urlPagamentoDoCliente(Number(cliente.id));
    if (!url)
      return { ok: false, error: 'Não foi possível gerar o link do cliente.' };
    clienteFinal.linkPagamentoCurto = url;
  }
  if (
    /\{(?:link_cliente|link_pagamento|pagamento|link)\}/i.test(
      modelo.mensagem || '',
    ) &&
    !clienteFinal.pagamentoToken &&
    !clienteFinal.pagamento_token
  ) {
    const id = Number(cliente.id);
    const pagamentoToken =
      Number.isSafeInteger(id) && id > 0 ? await tokenDoCliente(id) : null;
    if (!pagamentoToken)
      return {
        ok: false,
        error: 'Não foi possível gerar o link de renovação deste cliente.',
      };
    clienteFinal.pagamentoToken = pagamentoToken;
  }
  const texto = montarMensagem(modelo.mensagem || '', clienteFinal);
  const telefone = String(cliente.telefone ?? '');
  const mediaPath = String(modelo.mediaPath ?? '').trim();
  const mediaTipo = String(modelo.mediaTipo ?? '')
    .trim()
    .toLowerCase();
  if (mediaPath) {
    if (mediaTipo === 'audio') {
      return enviarAudio(sessao, telefone, mediaPath, token);
    }
    return enviarMidia(
      sessao,
      telefone,
      mediaPath,
      mediaTipo || 'image',
      texto,
      token,
    );
  }
  return enviarTexto(sessao, telefone, texto, token);
}
// Erros transientes do microserviço Baileys: tipicamente acontecem nos primeiros
// segundos após uma reconexão, enquanto o socket ainda está estabilizando.
// A mensagem seguinte costuma passar — então retry vale a pena.
function erroDeConexaoTransiente(error) {
  if (!error) return false;
  const msg = error.toLowerCase();
  return /n[aã]o conectado|not connected|session not found|socket|disconnected|connection closed|qr code/i.test(
    msg,
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Envia mensagem com retry automático em erros de conexão transientes.
 * Faz até 3 tentativas adicionais (4 totais) com 6s entre cada (~24s total).
 * Combinado com o requireConnectedSocket do microserviço (que ja espera 10s
 * por chamada), cobre janelas de reconexao de ate ~50s sem o usuario perceber.
 * Erros definitivos (telefone inválido, token errado, etc.) não fazem retry.
 */
export async function enviarMensagemModeloComRetry(
  sessao,
  cliente,
  modelo,
  token,
  maxTentativas = 4,
  pix,
) {
  let ultimoResult = { ok: false, error: 'Nenhuma tentativa executada.' };
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    const result = await enviarMensagemModelo(
      sessao,
      cliente,
      modelo,
      token,
      pix,
    );
    if (result.ok) return result;
    ultimoResult = result;
    if (!erroDeConexaoTransiente(result.error)) return result;
    if (tentativa < maxTentativas) await sleep(6000);
  }
  return ultimoResult;
}
// Checa se a sessão está conectada antes de iniciar um disparo em lote.
// Retorna { connected, error }. Em caso de URL ausente,
// assume conectado pra não bloquear (o envio em si reporta erro se falhar).
// Usa env.whatsapp.sessionStatusPath (default "/session/status/{session}") —
// mesmo endpoint que o topbar polleia.
export async function verificarConexaoSessao(sessao, token) {
  const url = sessionUrl(
    env.whatsapp.sessionStatusPath,
    sessao || env.whatsapp.sessionNameDefault,
  );
  if (!url) return { connected: true };
  const result = await jsonRequest(
    url,
    undefined,
    'GET',
    sessionHeaders(token),
  );
  // Em qualquer falha de rede/HTTP, NÃO bloqueia o disparo — só o envio reporta
  // a falha. Assim 404 do endpoint não vira "WhatsApp desconectado" falso.
  if (!result.ok) return { connected: true };
  const data = result.response;
  if (!data || typeof data !== 'object') return { connected: true };
  const status = String((data.status || data.state) ?? '').toLowerCase();
  const connected =
    status === 'conectado' ||
    status === 'connected' ||
    status === 'open' ||
    data.connected === true;
  return {
    connected,
    error: connected
      ? undefined
      : 'WhatsApp desconectado. Reconecte antes de disparar.',
  };
}
