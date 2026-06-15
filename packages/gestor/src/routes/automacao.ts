import { Router } from "express";
import { execute, queryOne, queryRows } from "../db/mysql.js";
import { appTodayIso } from "../services/dates.js";
import { boolField, toNullableString, toNumber } from "../services/format.js";
import { ensureCobrancasEnviosTable } from "../services/cobrancasCron.js";
import { jaSemeou, marcarSemeado, seedMensagensPadrao } from "./simpleCrud.js";
import type { RowDataPacket } from "mysql2";

interface RegraRow extends RowDataPacket {
  id: number; titulo: string; descricao: string | null; tipo: string; gatilho: string; periodo: number; tipoPeriodo: string;
  status: string; automatica: number; mensagemId: number | null; horaEnvio: string | null; diasSemana: string | null;
  minDelay: number | null; maxDelay: number | null; envioLotes: number; loteTamanho: number | null; lotePausa: number | null; rodapeAntiban: number;
  filtroServidor: string | null; filtroPlano: string | null; filtroArquivados: string | null;
  mensagemTitulo: string | null; mensagemTexto: string | null;
}
interface CountRow extends RowDataPacket { total: number; }
interface NomeRow extends RowDataPacket { id: number; nome: string; }
interface MsgRow extends RowDataPacket { id: number; titulo: string; mensagem: string | null; }
interface DisparoRow extends RowDataPacket { id: number; status: string; erro: string | null; clienteNome: string | null; regraTitulo: string | null; atualizadoEm: Date | string | null; }

export const automacaoRouter = Router();

// Tipo do gatilho -> descrição automática mostrada no card.
function descricaoRegra(tipo: string, periodo: number) {
  const t = String(tipo).toLowerCase();
  const d = Math.abs(Number(periodo) || 0);
  if (t === "vencimento") return `${d} dia(s) antes do venc. do plano`;
  if (t === "vence hoje") return "No dia do vencimento do plano";
  if (t === "vencidos") return `${d} dia(s) após venc. do plano`;
  if (t === "apos cadastro") return `${d} dia(s) após cadastro`;
  return "Todos os clientes";
}

function periodoAlvoPorTipo(tipo: string, periodo: number) {
  const t = String(tipo ?? "").toLowerCase().trim();
  const dias = Math.abs(Number(periodo) || 0);
  if (t === "vence hoje") return 0;
  if (t === "vencidos") return -dias;
  if (t === "vencimento") return dias;
  return Number(periodo) || 0;
}

interface RegraFiltro { tipo: string; periodo: number; filtroServidor: string | null; filtroPlano: string | null; }

// Monta o WHERE de quem recebe a regra (mesma lógica usada na contagem e na listagem).
function montarWhereRecebedores(userId: number, regra: RegraFiltro, today: string) {
  const t = String(regra.tipo).toLowerCase();
  const params: Record<string, unknown> = { userId, today };
  let where = "user_id = :userId AND status = 'Ativo'";
  if (t === "todos") {
    // toda a base ativa
  } else if (t === "apos cadastro") {
    where += " AND DATEDIFF(:today, DATE(created_at)) = :periodoCadastro";
    params.periodoCadastro = Math.abs(Number(regra.periodo) || 0);
  } else {
    where += " AND DATEDIFF(vencimento, :today) = :periodoAlvo";
    params.periodoAlvo = periodoAlvoPorTipo(regra.tipo, regra.periodo);
  }
  if (regra.filtroServidor) { where += " AND servidor = :filtroServidor"; params.filtroServidor = regra.filtroServidor; }
  if (regra.filtroPlano) { where += " AND plano = :filtroPlano"; params.filtroPlano = regra.filtroPlano; }
  return { where, params };
}

async function contarRecebedores(userId: number, regra: RegraRow, today: string) {
  const { where, params } = montarWhereRecebedores(userId, regra, today);
  const r = await queryRows<CountRow>(`SELECT COUNT(*) AS total FROM clientes WHERE ${where}`, params);
  return Number(r[0]?.total ?? 0);
}

// 6 regras padrão (desativadas), ligadas aos templates semeados pelo título.
const REGRAS_PADRAO: Array<{ titulo: string; tipo: string; periodo: number; msg: string }> = [
  { titulo: "Follow-up 5 dias após cadastro", tipo: "Apos cadastro", periodo: 5, msg: "Follow-up pós-cadastro" },
  { titulo: "Feedback 5 dias após vencimento", tipo: "Vencidos", periodo: 5, msg: "Como está o serviço?" },
  { titulo: "Cobrança 1 dia após vencimento", tipo: "Vencidos", periodo: 1, msg: "Acesso expirado" },
  { titulo: "Lembrete 1 dia antes", tipo: "Vencimento", periodo: 1, msg: "Aviso de vencimento" },
  { titulo: "Vence hoje", tipo: "Vence hoje", periodo: 0, msg: "Vence hoje" },
  { titulo: "Lembrete 3 dias antes", tipo: "Vencimento", periodo: 3, msg: "Aviso de vencimento" },
];

async function seedRegrasPadrao(userId: number) {
  // Semeia as 6 regras padrão UMA ÚNICA VEZ (não recria as apagadas depois).
  if (await jaSemeou(userId, "regras")) return;
  await seedMensagensPadrao(userId);
  const [existentes, mensagens] = await Promise.all([
    queryRows<RowDataPacket & { titulo: string }>("SELECT titulo FROM cobrancas WHERE user_id = :userId", { userId }),
    queryRows<MsgRow>("SELECT id, titulo FROM mensagens WHERE user_id = :userId", { userId }),
  ]);
  const titulos = new Set(existentes.map((r) => String(r.titulo).trim().toLowerCase()));
  const idPorTitulo = new Map(mensagens.map((m) => [m.titulo, m.id]));
  for (const r of REGRAS_PADRAO) {
    if (titulos.has(r.titulo.toLowerCase())) continue;
    await execute(
      `INSERT INTO cobrancas (user_id, titulo, descricao, tipo, gatilho, tipo_periodo, periodo, status, automatica,
            mensagem_id, hora_envio, dias_semana, rodape_antiban)
       VALUES (:userId, :titulo, :descricao, :tipo, 'plano', 'Dias', :periodo, 'Inativo', 0,
            :mensagemId, '09:00:00', '0,1,2,3,4,5,6', 1)`,
      { userId, titulo: r.titulo, descricao: descricaoRegra(r.tipo, r.periodo), tipo: r.tipo, periodo: r.periodo, mensagemId: idPorTitulo.get(r.msg) ?? null },
    );
  }
  await marcarSemeado(userId, "regras");
}

automacaoRouter.get("/automacao", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    await ensureCobrancasEnviosTable();
    await seedRegrasPadrao(userId);
    const today = appTodayIso();
    const [regrasRows, statsEntrega, disparos, clientesCount, planos, servidores, mensagens] = await Promise.all([
      queryRows<RegraRow>(
        `SELECT c.id, c.titulo, c.descricao, c.tipo, c.gatilho, c.periodo, c.tipo_periodo AS tipoPeriodo, c.status, c.automatica,
                c.mensagem_id AS mensagemId, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana,
                c.min_delay AS minDelay, c.max_delay AS maxDelay, c.envio_lotes AS envioLotes,
                c.lote_tamanho AS loteTamanho, c.lote_pausa AS lotePausa, c.rodape_antiban AS rodapeAntiban,
                c.filtro_servidor AS filtroServidor, c.filtro_plano AS filtroPlano, c.filtro_arquivados AS filtroArquivados,
                m.titulo AS mensagemTitulo, m.mensagem AS mensagemTexto
           FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id
          WHERE c.user_id = :userId ORDER BY c.id DESC`,
        { userId },
      ),
      queryRows<RowDataPacket & { enviados: number; erros: number }>(
        `SELECT COALESCE(SUM(ce.status = 'enviado'), 0) AS enviados, COALESCE(SUM(ce.status = 'erro'), 0) AS erros
           FROM cobrancas_envios ce JOIN cobrancas c ON c.id = ce.cobranca_id
          WHERE c.user_id = :userId AND ce.data_envio = :today`,
        { userId, today },
      ),
      queryRows<DisparoRow>(
        `SELECT ce.id, ce.status, ce.erro, ce.updated_at AS atualizadoEm, cl.nome AS clienteNome, co.titulo AS regraTitulo
           FROM cobrancas_envios ce JOIN cobrancas co ON co.id = ce.cobranca_id
           LEFT JOIN clientes cl ON cl.id = ce.cliente_id AND cl.user_id = co.user_id
          WHERE co.user_id = :userId ORDER BY ce.updated_at DESC, ce.id DESC LIMIT 100`,
        { userId },
      ),
      queryRows<CountRow>("SELECT COUNT(*) AS total FROM clientes WHERE user_id = :userId", { userId }),
      queryRows<NomeRow>("SELECT id, nome FROM planos WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<NomeRow>("SELECT id, nome FROM servidores WHERE user_id = :userId ORDER BY nome ASC", { userId }),
      queryRows<MsgRow>("SELECT id, titulo, mensagem FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC", { userId }),
    ]);

    const regras = await Promise.all(regrasRows.map(async (r) => ({
      ...r,
      recebedores: await contarRecebedores(userId, r, today),
      diasSemanaLista: String(r.diasSemana ?? "").split(",").map((x) => x.trim()).filter(Boolean),
    })));

    const enviados = Number(statsEntrega[0]?.enviados ?? 0);
    const erros = Number(statsEntrega[0]?.erros ?? 0);
    const stats = {
      regras: regras.length,
      ativas: regras.filter((r) => r.status === "Ativo").length,
      mensagensHoje: enviados,
      entrega: enviados + erros > 0 ? Math.round((enviados / (enviados + erros)) * 100) : 0,
    };

    res.render("pages/automacao", {
      title: "Automação", subtitle: "Envie mensagens automáticas para seus clientes",
      stats, regras, disparos: disparos.map((d) => ({ ...d, quando: formatDateTimeBr(d.atualizadoEm) })),
      clientesCount: Number(clientesCount[0]?.total ?? 0), planos, servidores, mensagens,
    });
  } catch (error) { next(error); }
});

automacaoRouter.post("/automacao", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const action = String(req.body.action ?? "");
    const id = Number(req.body.id);

    if (action === "delete_regra") {
      await execute("DELETE FROM cobrancas WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Regra apagada.");
      return res.redirect("/automacao");
    }
    if (action === "toggle_regra") {
      await execute(
        "UPDATE cobrancas SET status = IF(status = 'Ativo', 'Inativo', 'Ativo'), automatica = IF(status = 'Ativo', 0, 1) WHERE id = :id AND user_id = :userId",
        { id, userId },
      );
      return res.redirect("/automacao");
    }

    const ativa = boolField(req.body.ativa);
    const tipo = String(req.body.tipo || "Vencimento");
    const periodo = toNumber(req.body.periodo);
    const diasInput = req.body["dias_semana[]"] ?? req.body.dias_semana;
    const data = {
      userId, id,
      titulo: String(req.body.nome ?? req.body.titulo ?? "").trim(),
      descricao: descricaoRegra(tipo, periodo),
      tipo,
      gatilho: String(req.body.gatilho || "plano"),
      tipoPeriodo: String(req.body.tipo_periodo || "Dias"),
      periodo,
      status: ativa ? "Ativo" : "Inativo",
      automatica: ativa,
      mensagemId: req.body.mensagem_id ? Number(req.body.mensagem_id) : null,
      horaEnvio: toNullableString(req.body.hora_envio) ?? "09:00",
      diasSemana: Array.isArray(diasInput) ? diasInput.join(",") : toNullableString(diasInput),
      minDelay: req.body.min_delay ? toNumber(req.body.min_delay) : null,
      maxDelay: req.body.max_delay ? toNumber(req.body.max_delay) : null,
      envioLotes: boolField(req.body.envio_lotes),
      loteTamanho: req.body.lote_tamanho ? toNumber(req.body.lote_tamanho, 20) : 20,
      lotePausa: req.body.lote_pausa ? toNumber(req.body.lote_pausa, 60) : 60,
      rodapeAntiban: boolField(req.body.rodape_antiban),
      filtroServidor: toNullableString(req.body.filtro_servidor),
      filtroPlano: toNullableString(req.body.filtro_plano),
      filtroArquivados: toNullableString(req.body.filtro_arquivados),
    };

    if (!data.titulo) {
      req.flash("error", "Informe o nome da regra.");
      return res.redirect("/automacao");
    }

    const campos = `titulo = :titulo, descricao = :descricao, tipo = :tipo, gatilho = :gatilho, tipo_periodo = :tipoPeriodo,
      periodo = :periodo, status = :status, automatica = :automatica, mensagem_id = :mensagemId, hora_envio = :horaEnvio,
      dias_semana = :diasSemana, min_delay = :minDelay, max_delay = :maxDelay, envio_lotes = :envioLotes,
      lote_tamanho = :loteTamanho, lote_pausa = :lotePausa,
      rodape_antiban = :rodapeAntiban, filtro_servidor = :filtroServidor, filtro_plano = :filtroPlano, filtro_arquivados = :filtroArquivados`;
    if (action === "update_regra") {
      await execute(`UPDATE cobrancas SET ${campos} WHERE id = :id AND user_id = :userId`, data);
      req.flash("success", "Regra atualizada.");
    } else {
      await execute(
        `INSERT INTO cobrancas (user_id, titulo, descricao, tipo, gatilho, tipo_periodo, periodo, status, automatica,
              mensagem_id, hora_envio, dias_semana, min_delay, max_delay, envio_lotes, lote_tamanho, lote_pausa, rodape_antiban,
              filtro_servidor, filtro_plano, filtro_arquivados, ultima_execucao)
         VALUES (:userId, :titulo, :descricao, :tipo, :gatilho, :tipoPeriodo, :periodo, :status, :automatica,
              :mensagemId, :horaEnvio, :diasSemana, :minDelay, :maxDelay, :envioLotes, :loteTamanho, :lotePausa, :rodapeAntiban,
              :filtroServidor, :filtroPlano, :filtroArquivados, '1970-01-01 00:00:00')`, data);
      req.flash("success", "Regra criada.");
    }
    return res.redirect("/automacao");
  } catch (error) { next(error); }
});

interface RegraConsultaRow extends RowDataPacket { tipo: string; periodo: number; filtroServidor: string | null; filtroPlano: string | null; }
interface RecebedorRow extends RowDataPacket { id: number; nome: string; telefone: string; vencimento: Date | string; plano: string; }

// Lista os clientes que a regra atinge hoje (para o popup "N clientes").
automacaoRouter.get("/automacao/regra/:id/recebedores", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.params.id);
    const regra = await queryOne<RegraConsultaRow>(
      "SELECT tipo, periodo, filtro_servidor AS filtroServidor, filtro_plano AS filtroPlano FROM cobrancas WHERE id = :id AND user_id = :userId LIMIT 1",
      { id, userId },
    );
    if (!regra) return res.json({ ok: false, clientes: [] });
    const { where, params } = montarWhereRecebedores(userId, regra, appTodayIso());
    const clientes = await queryRows<RecebedorRow>(
      `SELECT id, nome, telefone, vencimento, plano FROM clientes WHERE ${where} ORDER BY nome ASC LIMIT 300`,
      params,
    );
    res.json({ ok: true, clientes });
  } catch (error) { next(error); }
});

function formatDateTimeBr(value: Date | string | null) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}
