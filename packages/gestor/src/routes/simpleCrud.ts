import { Router } from "express";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { boolField, toNullableString, toNumber } from "../services/format.js";
import type { RowDataPacket } from "mysql2";

// Os clientes (e transações) guardam plano/servidor como string denormalizada.
// Quando o usuário renomeia um catálogo, propaga para todas as linhas vinculadas —
// senão a tela de Clientes fica mostrando o nome antigo até o próximo cadastro.
async function propagarRenomeacao(
  userId: number,
  campo: "plano" | "servidor" | "dispositivo" | "aplicativo",
  nomeAntigo: string,
  nomeNovo: string,
) {
  if (!nomeAntigo || !nomeNovo || nomeAntigo === nomeNovo) return;
  await execute(
    `UPDATE clientes SET \`${campo}\` = :novo WHERE user_id = :userId AND \`${campo}\` = :antigo`,
    { userId, antigo: nomeAntigo, novo: nomeNovo },
  );
  if (campo === "plano" || campo === "servidor") {
    await execute(
      `UPDATE transacoes SET \`${campo}\` = :novo WHERE user_id = :userId AND \`${campo}\` = :antigo`,
      { userId, antigo: nomeAntigo, novo: nomeNovo },
    );
  }
}

interface PlanoRow extends RowDataPacket { id: number; nome: string; clientes: number; tipo: string; periodo: number; observacao: string | null; creditos: number; ativo: number; }

// Planos padrão semeados na primeira vez que o usuário abre a tela (se não tiver nenhum).
const PLANOS_PADRAO: Array<[string, number, number, string]> = [
  ["Mensal", 30, 1, "Plano mensal de 30 dias"],
  ["Trimestral", 90, 3, "Plano trimestral de 90 dias"],
  ["Semestral", 180, 6, "Plano semestral de 180 dias"],
  ["Anual", 365, 12, "Plano anual de 365 dias"],
];

// Marcação "já semeei os padrões X para este usuário" (tabela user_seeds).
export async function jaSemeou(userId: number, chave: string) {
  const rows = await queryRows<RowDataPacket & { user_id: number }>(
    "SELECT user_id FROM user_seeds WHERE user_id = :userId AND chave = :chave LIMIT 1", { userId, chave });
  return rows.length > 0;
}
export async function marcarSemeado(userId: number, chave: string) {
  await execute("INSERT IGNORE INTO user_seeds (user_id, chave) VALUES (:userId, :chave)", { userId, chave });
}

async function seedPlanosPadrao(userId: number) {
  // Semeia os padrões UMA ÚNICA VEZ. Se o usuário apagar um depois, NÃO recria.
  if (await jaSemeou(userId, "planos")) return;
  const existentes = await queryRows<RowDataPacket & { nome: string }>("SELECT nome FROM planos WHERE user_id = :userId", { userId });
  const nomes = new Set(existentes.map((r) => String(r.nome).trim().toLowerCase()));
  for (const [nome, periodo, creditos, descricao] of PLANOS_PADRAO) {
    if (nomes.has(nome.toLowerCase())) continue;
    await execute(
      `INSERT INTO planos (user_id, nome, tipo, periodo, credito_gastos, clientes, observacao, ativo)
       VALUES (:userId, :nome, 'Dias', :periodo, :creditos, 0, :descricao, 1)`,
      { userId, nome, periodo, creditos, descricao },
    );
  }
  await marcarSemeado(userId, "planos");
}
interface ServidorRow extends RowDataPacket {
  id: number; nome: string; clientesTotal: number; clientesAtivos: number; clientesInativos: number;
  testesTotal: number; testesAtivos: number; testesInativos: number; creditos: number; valorCred: number; sessao: string; integracao: string;
  identificador: string | null; linkPainel: string | null; cobrancaPorTelas: number; observacaoServidor: string | null;
  renovacaoAutomatica: number; dispositivoWhatsapp: string | null; urlAppAndroid: string | null; urlAppIos: string | null;
  infoServidor: string | null; dns1: string | null; dns2: string | null; dns3: string | null; dns4: string | null;
  urlApiXc: string | null; urlApiSmarters: string | null; epg: string | null; pix: string | null; pixNome: string | null;
  pixTipo: string | null; urlRenovacao: string | null;
}
interface MensagemRow extends RowDataPacket { id: number; titulo: string; descricao: string | null; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null; }

// Templates de mensagem padrão, semeados na primeira visita (se o usuário não tiver nenhum).
const MENSAGENS_PADRAO: Array<[string, string, string]> = [
  ["Boas-vindas", "Mensagem de boas-vindas ao novo cliente", "{saudacao}! 🎉 Seja bem-vindo(a), {nome}!\n\nSuas credenciais de acesso:\n👤 *Usuário:* {usuario}\n🔑 *Senha:* {senha}\n📦 *Plano:* {plano}\n📅 *Vencimento:* {vencimento}\n\nQualquer dúvida, estamos à disposição! 💬"],
  ["Credenciais de acesso", "Usuário, senha, plano e vencimento", "{saudacao} {nome}! 📲 Seus dados de acesso:\n\n👤 *Usuário:* {usuario}\n🔑 *Senha:* {senha}\n📦 *Plano:* {plano}\n📅 *Vencimento:* {vencimento}\n\nGuarde com segurança! 🔒"],
  ["Aviso de vencimento", "Aviso enviado dias antes do vencimento", "{saudacao} {nome}! ⚠️ Seu plano vence em *{vencimento}*.\n\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nRenove para não perder o acesso. 🙏"],
  ["Vence hoje", "Lembrete enviado no dia do vencimento", "{saudacao} {nome}! ⚠️ Seu acesso vence *hoje*!\n\nRenove agora para não perder o acesso:\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nQualquer dúvida, é só chamar! 😉"],
  ["Acesso expirado", "Mensagem enviada após o vencimento", "{saudacao} {nome}! ❌ Seu acesso expirou.\n\nRenove agora e volte a aproveitar:\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nQualquer dúvida, é só chamar! 😉"],
  ["Cobrança manual", "Template para cobrança avulsa", "{saudacao} {nome}! 💰 Passando para lembrar sobre a renovação do seu plano.\n\n📅 *Vencimento:* {vencimento}\n💰 *Valor:* {valor}\n\nPosso te ajudar com a renovação? 😊"],
  ["Link de pagamento", "Link PIX para renovação", "{saudacao} {nome}! 💳 Segue o link para renovação do seu plano:\n\n🔗 *Link:* {url_renovacao}\n📦 *Plano:* {plano}\n💰 *Valor:* {valor}\n\nApós o pagamento, seu acesso é liberado! ✅"],
  ["Renovação confirmada", "Enviada após confirmação de renovação", "{saudacao} {nome}! ✅ Sua renovação foi confirmada!\n\n📦 *Plano:* {plano}\n📅 *Novo vencimento:* {vencimento}\n\nObrigado pela confiança! Bom proveito! 🎉"],
  ["Falha na Renovação do Painel", "Enviada ao cliente quando a renovação automática no painel falha", "{saudacao} {nome}! ⚠️ Sua renovação foi processada, porém ocorreu uma instabilidade ao atualizar o painel.\n\nJá estamos resolvendo e seu acesso será normalizado em instantes. Obrigado pela compreensão! 🙏"],
  ["Como está o serviço?", "Feedback 5 dias após o vencimento — verificar se cliente ainda tem interesse", "{saudacao} {primeiro_nome}! 👋 Passando para saber como você está!\n\nPercebemos que seu acesso não foi renovado. Está tudo certo com o serviço? Se precisar de algo, é só falar! 🙌"],
  ["Follow-up pós-cadastro", "Enviado 5 dias após o cadastro para saber se o cliente está satisfeito", "{saudacao} {primeiro_nome}! 😊 Passando para saber como está sendo sua experiência com o serviço!\n\nEstá tudo funcionando bem? Qualquer dúvida ou sugestão, conte com a gente! 💬"],
];

export async function seedMensagensPadrao(userId: number) {
  // Semeia os templates padrão UMA ÚNICA VEZ (não recria os apagados depois).
  if (await jaSemeou(userId, "mensagens")) return;
  const existentes = await queryRows<RowDataPacket & { titulo: string }>("SELECT titulo FROM mensagens WHERE user_id = :userId", { userId });
  const titulos = new Set(existentes.map((r) => String(r.titulo).trim().toLowerCase()));
  for (const [titulo, descricao, mensagem] of MENSAGENS_PADRAO) {
    if (titulos.has(titulo.toLowerCase())) continue;
    await execute(
      `INSERT INTO mensagens (user_id, titulo, descricao, mensagem) VALUES (:userId, :titulo, :descricao, :mensagem)`,
      { userId, titulo, descricao, mensagem },
    );
  }
  await marcarSemeado(userId, "mensagens");
}

export const crudRouter = Router();

crudRouter.get("/planos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    await seedPlanosPadrao(userId);
    const planos = await queryRows<PlanoRow>(
      `SELECT p.id, p.nome, COALESCE(contagem.clientes, 0) AS clientes,
              p.tipo, p.periodo, p.observacao, p.credito_gastos AS creditos, p.ativo
         FROM planos p
         LEFT JOIN (
           SELECT user_id, TRIM(plano) AS plano, COUNT(*) AS clientes
             FROM clientes
            WHERE user_id = :userId AND TRIM(COALESCE(plano, '')) <> ''
            GROUP BY user_id, TRIM(plano)
         ) contagem ON contagem.user_id = p.user_id AND contagem.plano = TRIM(p.nome)
        WHERE p.user_id = :userId
        ORDER BY p.id DESC`, { userId: req.session.user!.id });
    res.render("pages/planos", { title: "Planos de Clientes", subtitle: "Gerencie os planos disponíveis para seus clientes", planos });
  } catch (error) { next(error); }
});

crudRouter.post("/planos", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_plano") {
      await execute("DELETE FROM planos WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Plano apagado.");
    } else {
      const data = { userId, id, nome: String(req.body.nome ?? "").trim(), tipo: String(req.body.tipo || "Dias"), periodo: toNumber(req.body.periodo, 1), creditoGastos: toNumber(req.body.creditos, 0), observacao: toNullableString(req.body.observacao), ativo: boolField(req.body.ativo) };
      if (action === "update_plano") {
        const atual = await queryOne<RowDataPacket & { nome: string }>(
          "SELECT nome FROM planos WHERE id = :id AND user_id = :userId LIMIT 1", { id, userId },
        );
        await execute(`UPDATE planos SET nome = :nome, tipo = :tipo, periodo = :periodo, credito_gastos = :creditoGastos, observacao = :observacao, ativo = :ativo WHERE id = :id AND user_id = :userId`, data);
        if (atual?.nome) await propagarRenomeacao(userId, "plano", atual.nome, data.nome);
        req.flash("success", "Plano atualizado.");
      } else {
        await execute(`INSERT INTO planos (user_id, nome, tipo, periodo, credito_gastos, clientes, observacao, ativo) VALUES (:userId, :nome, :tipo, :periodo, :creditoGastos, 0, :observacao, :ativo)`, data);
        req.flash("success", "Plano criado.");
      }
    }
    res.redirect("/planos");
  } catch (error) { next(error); }
});

crudRouter.get("/servidores", async (req, res, next) => {
  try {
    const servidores = await queryRows<ServidorRow>(
      `SELECT s.id, s.nome,
              COALESCE(contagem.clientesTotal, 0) AS clientesTotal,
              COALESCE(contagem.clientesAtivos, 0) AS clientesAtivos,
              COALESCE(contagem.clientesInativos, 0) AS clientesInativos,
              s.testes_total AS testesTotal, s.testes_ativos AS testesAtivos,
              s.testes_inativos AS testesInativos, s.creditos, s.valor_cred AS valorCred, s.sessao, s.integracao,
              s.identificador, s.link_painel AS linkPainel, s.cobranca_por_telas AS cobrancaPorTelas,
              s.observacao_servidor AS observacaoServidor, s.renovacao_automatica AS renovacaoAutomatica,
              s.dispositivo_whatsapp AS dispositivoWhatsapp, s.url_app_android AS urlAppAndroid, s.url_app_ios AS urlAppIos,
              s.info_servidor AS infoServidor, s.dns_1 AS dns1, s.dns_2 AS dns2, s.dns_3 AS dns3, s.dns_4 AS dns4,
              s.url_api_xc AS urlApiXc, s.url_api_smarters AS urlApiSmarters, s.epg, s.pix, s.pix_nome AS pixNome,
              s.pix_tipo AS pixTipo, s.url_renovacao AS urlRenovacao
         FROM servidores s
         LEFT JOIN (
           SELECT user_id, TRIM(servidor) AS servidor,
                  COUNT(*) AS clientesTotal,
                  SUM(status = 'Ativo') AS clientesAtivos,
                  SUM(status = 'Inativo') AS clientesInativos
             FROM clientes
            WHERE user_id = :userId AND TRIM(COALESCE(servidor, '')) <> ''
            GROUP BY user_id, TRIM(servidor)
         ) contagem ON contagem.user_id = s.user_id AND contagem.servidor = TRIM(s.nome)
        WHERE s.user_id = :userId
        ORDER BY s.id DESC`, { userId: req.session.user!.id });
    res.render("pages/servidores", { title: "Servidores", servidores });
  } catch (error) { next(error); }
});

crudRouter.post("/servidores", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_servidor") {
      await execute("DELETE FROM servidores WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Servidor apagado.");
    } else {
      const data = {
        userId, id, nome: String(req.body.nome ?? "").trim(),
        clientesTotal: toNumber(req.body.clientes_total), clientesAtivos: toNumber(req.body.clientes_ativos), clientesInativos: toNumber(req.body.clientes_inativos),
        testesTotal: toNumber(req.body.testes_total), testesAtivos: toNumber(req.body.testes_ativos), testesInativos: toNumber(req.body.testes_inativos),
        creditos: toNumber(req.body.creditos), valorCred: toNumber(req.body.valor_cred), sessao: String(req.body.sessao ?? "Não definido"), integracao: String(req.body.integracao || "Não definida"),
        identificador: toNullableString(req.body.identificador), linkPainel: toNullableString(req.body.link_painel),
        cobrancaPorTelas: boolField(req.body.cobranca_por_telas), observacaoServidor: toNullableString(req.body.observacao_servidor),
        renovacaoAutomatica: boolField(req.body.renovacao_automatica), dispositivoWhatsapp: toNullableString(req.body.dispositivo_whatsapp),
        urlAppAndroid: toNullableString(req.body.url_app_android), urlAppIos: toNullableString(req.body.url_app_ios), infoServidor: toNullableString(req.body.info_servidor),
        dns1: toNullableString(req.body.dns_1), dns2: toNullableString(req.body.dns_2), dns3: toNullableString(req.body.dns_3), dns4: toNullableString(req.body.dns_4),
        urlApiXc: toNullableString(req.body.url_api_xc), urlApiSmarters: toNullableString(req.body.url_api_smarters), epg: toNullableString(req.body.epg),
        pix: toNullableString(req.body.pix), pixNome: toNullableString(req.body.pix_nome), pixTipo: toNullableString(req.body.pix_tipo), urlRenovacao: toNullableString(req.body.url_renovacao),
      };
      const novosSet = `identificador = :identificador, link_painel = :linkPainel, cobranca_por_telas = :cobrancaPorTelas, observacao_servidor = :observacaoServidor, renovacao_automatica = :renovacaoAutomatica, dispositivo_whatsapp = :dispositivoWhatsapp, url_app_android = :urlAppAndroid, url_app_ios = :urlAppIos, info_servidor = :infoServidor, dns_1 = :dns1, dns_2 = :dns2, dns_3 = :dns3, dns_4 = :dns4, url_api_xc = :urlApiXc, url_api_smarters = :urlApiSmarters, epg = :epg, pix = :pix, pix_nome = :pixNome, pix_tipo = :pixTipo, url_renovacao = :urlRenovacao`;
      if (action === "update_servidor") {
        const atual = await queryOne<RowDataPacket & { nome: string }>(
          "SELECT nome FROM servidores WHERE id = :id AND user_id = :userId LIMIT 1", { id, userId },
        );
        await execute(`UPDATE servidores SET nome = :nome, clientes_total = :clientesTotal, clientes_ativos = :clientesAtivos, clientes_inativos = :clientesInativos, testes_total = :testesTotal, testes_ativos = :testesAtivos, testes_inativos = :testesInativos, creditos = :creditos, valor_cred = :valorCred, sessao = :sessao, integracao = :integracao, ${novosSet} WHERE id = :id AND user_id = :userId`, data);
        if (atual?.nome) await propagarRenomeacao(userId, "servidor", atual.nome, data.nome);
        req.flash("success", "Servidor atualizado.");
      } else {
        await execute(`INSERT INTO servidores (user_id, nome, clientes_total, clientes_ativos, clientes_inativos, testes_total, testes_ativos, testes_inativos, creditos, valor_cred, sessao, integracao, identificador, link_painel, cobranca_por_telas, observacao_servidor, renovacao_automatica, dispositivo_whatsapp, url_app_android, url_app_ios, info_servidor, dns_1, dns_2, dns_3, dns_4, url_api_xc, url_api_smarters, epg, pix, pix_nome, pix_tipo, url_renovacao) VALUES (:userId, :nome, :clientesTotal, :clientesAtivos, :clientesInativos, :testesTotal, :testesAtivos, :testesInativos, :creditos, :valorCred, :sessao, :integracao, :identificador, :linkPainel, :cobrancaPorTelas, :observacaoServidor, :renovacaoAutomatica, :dispositivoWhatsapp, :urlAppAndroid, :urlAppIos, :infoServidor, :dns1, :dns2, :dns3, :dns4, :urlApiXc, :urlApiSmarters, :epg, :pix, :pixNome, :pixTipo, :urlRenovacao)`, data);
        req.flash("success", "Servidor criado.");
      }
    }
    res.redirect("/servidores");
  } catch (error) { next(error); }
});

crudRouter.get("/mensagens", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    await seedMensagensPadrao(userId);
    const mensagens = await queryRows<MensagemRow>(`SELECT id, titulo, descricao, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC`, { userId });
    res.render("pages/mensagens", { title: "Mensagens", subtitle: "Templates de mensagem para envio automático e manual", mensagens });
  } catch (error) { next(error); }
});

crudRouter.post("/mensagens", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_mensagem") {
      await execute("DELETE FROM mensagens WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Mensagem apagada.");
    } else {
      const data = { userId, id, titulo: String(req.body.titulo ?? "").trim(), descricao: toNullableString(req.body.descricao), mensagem: toNullableString(req.body.mensagem), mediaTipo: toNullableString(req.body.media_tipo), mediaPath: toNullableString(req.body.media_path) };
      if (action === "update_mensagem") {
        await execute(`UPDATE mensagens SET titulo = :titulo, descricao = :descricao, mensagem = :mensagem, media_tipo = :mediaTipo, media_path = :mediaPath WHERE id = :id AND user_id = :userId`, data);
        req.flash("success", "Mensagem atualizada.");
      } else {
        await execute(`INSERT INTO mensagens (user_id, titulo, descricao, mensagem, media_tipo, media_path) VALUES (:userId, :titulo, :descricao, :mensagem, :mediaTipo, :mediaPath)`, data);
        req.flash("success", "Mensagem criada.");
      }
    }
    res.redirect("/mensagens");
  } catch (error) { next(error); }
});
