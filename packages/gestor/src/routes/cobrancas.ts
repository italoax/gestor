import { Router } from "express";
import { execute, queryRows } from "../db/mysql.js";
import { appNowSql, appTodayIso } from "../services/dates.js";
import { boolField, toNullableString, toNumber } from "../services/format.js";
import { enviarMensagemModelo } from "../services/whatsapp.js";
import { finalizarEnvioCobranca, reservarEnvioCobranca } from "../services/cobrancasCron.js";
import type { RowDataPacket } from "mysql2";

interface CobrancaRow extends RowDataPacket { id: number; titulo: string; tipo: string; tipoPeriodo: string; periodo: number; status: string; automatica: number; ultimaExecucao: Date | string; mensagemId: number | null; horaEnvio: string | null; diasSemana: string | null; mensagemTitulo: string | null; }
interface ClienteCobrancaView { id: number; nome: string; telefone: string; vencimento: Date | string; }
interface CobrancaViewRow extends CobrancaRow { horaEnvioCurta: string; diasSemanaLista: string[]; recebedores: ClienteCobrancaView[]; }
interface MensagemRow extends RowDataPacket { id: number; titulo: string; mensagem: string | null; mediaTipo: string | null; mediaPath: string | null; }
interface ClienteRow extends RowDataPacket { id: number; nome: string; telefone: string; vencimento: Date | string; valor: number; plano: string; servidor: string; }

export const cobrancasRouter = Router();

cobrancasRouter.get("/cobrancas", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const [cobrancas, mensagens] = await Promise.all([
      queryRows<CobrancaRow>(`SELECT c.id, c.titulo, c.tipo, c.tipo_periodo AS tipoPeriodo, c.periodo, c.status, c.automatica, c.ultima_execucao AS ultimaExecucao, c.mensagem_id AS mensagemId, c.hora_envio AS horaEnvio, c.dias_semana AS diasSemana, m.titulo AS mensagemTitulo FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id WHERE c.user_id = :userId ORDER BY c.id DESC`, { userId }),
      queryRows<MensagemRow>("SELECT id, titulo, mensagem, media_tipo AS mediaTipo, media_path AS mediaPath FROM mensagens WHERE user_id = :userId ORDER BY titulo ASC", { userId }),
    ]);
    const cobrancasView: CobrancaViewRow[] = await Promise.all(cobrancas.map(async (c) => ({
      ...c,
      horaEnvioCurta: formatHoraEnvio(c.horaEnvio),
      diasSemanaLista: formatDiasSemana(c.diasSemana),
      recebedores: await clientesParaCobranca(userId, c.tipo, c.periodo),
    })));
    res.render("pages/cobrancas", { title: "Cobranças", cobrancas: cobrancasView, mensagens });
  } catch (error) { next(error); }
});

cobrancasRouter.post("/cobrancas", async (req, res, next) => {
  try {
    const userId = req.session.user!.id;
    const id = Number(req.body.id);
    const action = String(req.body.action ?? "");
    if (action === "delete_cobranca") {
      await execute("DELETE FROM cobrancas WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Cobrança apagada.");
      return res.redirect("/cobrancas");
    }
    if (action === "toggle_cobranca") {
      await execute("UPDATE cobrancas SET status = IF(status = 'Ativo', 'Inativo', 'Ativo') WHERE id = :id AND user_id = :userId", { id, userId });
      req.flash("success", "Status da cobrança atualizado.");
      return res.redirect("/cobrancas");
    }
    if (action === "send_cobranca") {
      const cobrancas = await queryRows<CobrancaRow & { mensagem: string | null; mediaTipo: string | null; mediaPath: string | null }>(`SELECT c.*, c.mensagem_id AS mensagemId, m.mensagem, m.media_tipo AS mediaTipo, m.media_path AS mediaPath FROM cobrancas c LEFT JOIN mensagens m ON m.id = c.mensagem_id AND m.user_id = c.user_id WHERE c.id = :id AND c.user_id = :userId LIMIT 1`, { id, userId });
      const cobranca = cobrancas[0];
      if (!cobranca) {
        req.flash("error", "Cobrança não encontrada.");
        return res.redirect("/cobrancas");
      }
      const clientes = await clientesParaCobranca(userId, cobranca.tipo, cobranca.periodo);
      let enviados = 0;
      for (const cliente of clientes) {
        const reservaId = await reservarEnvioCobranca(cobranca.id, cliente.id);
        if (!reservaId) continue;

        const result = await enviarMensagemModelo(cliente.servidor || "", cliente, {
          mensagem: cobranca.mensagem || "Olá {nome}, seu plano {plano} vence em {vencimento}. Valor: {valor}.",
          mediaTipo: cobranca.mediaTipo,
          mediaPath: cobranca.mediaPath,
        });
        await finalizarEnvioCobranca(reservaId, result.ok, result.error);
        if (result.ok) enviados += 1;
      }
      await execute("UPDATE cobrancas SET ultima_execucao = :ultimaExecucao WHERE id = :id AND user_id = :userId", { id, userId, ultimaExecucao: appNowSql() });
      req.flash("success", `Cobrança executada. Mensagens enviadas: ${enviados}.`);
      return res.redirect("/cobrancas");
    }

    const diasInput = req.body["dias_semana[]"] ?? req.body.dias_semana;
      const data = {
      userId, id, titulo: String(req.body.titulo ?? "").trim(), tipo: String(req.body.tipo ?? "Vencimento"),
      tipoPeriodo: String(req.body.tipo_periodo ?? "Dias"), periodo: toNumber(req.body.periodo),
      status: String(req.body.status ?? "Ativo"), automatica: boolField(req.body.automatica),
      ultimaExecucao: toNullableString(req.body.ultima_execucao) ?? "1970-01-01 00:00:00",
      mensagemId: req.body.mensagem_id ? Number(req.body.mensagem_id) : null,
      horaEnvio: toNullableString(req.body.hora_envio) ?? "09:00",
      diasSemana: Array.isArray(diasInput) ? diasInput.join(",") : toNullableString(diasInput),
    };
    if (action === "update_cobranca") {
      await execute(`UPDATE cobrancas SET titulo = :titulo, tipo = :tipo, tipo_periodo = :tipoPeriodo, periodo = :periodo, status = :status, automatica = :automatica, mensagem_id = :mensagemId, hora_envio = :horaEnvio, dias_semana = :diasSemana WHERE id = :id AND user_id = :userId`, data);
      req.flash("success", "Cobrança atualizada.");
    } else {
      await execute(`INSERT INTO cobrancas (user_id, titulo, tipo, tipo_periodo, periodo, status, automatica, ultima_execucao, mensagem_id, hora_envio, dias_semana) VALUES (:userId, :titulo, :tipo, :tipoPeriodo, :periodo, :status, :automatica, :ultimaExecucao, :mensagemId, :horaEnvio, :diasSemana)`, data);
      req.flash("success", "Cobrança criada.");
    }
    return res.redirect("/cobrancas");
  } catch (error) { next(error); }
});

function periodoAlvoPorTipo(tipo: string, periodo: number) {
  const tipoNormalizado = String(tipo ?? "").toLowerCase().trim();
  const dias = Math.abs(Number(periodo) || 0);

  if (tipoNormalizado === "vence hoje") return 0;
  if (tipoNormalizado === "vencidos") return -dias;
  if (tipoNormalizado === "vencimento") return dias;

  return Number(periodo) || 0;
}

async function clientesParaCobranca(userId: number, tipo: string, periodo: number) {
  const periodoAlvo = periodoAlvoPorTipo(tipo, periodo);
  return queryRows<ClienteRow>(`SELECT id, nome, telefone, vencimento, valor, plano, servidor FROM clientes WHERE user_id = :userId AND DATEDIFF(vencimento, :today) = :periodoAlvo AND status = 'Ativo' ORDER BY nome ASC`, { userId, periodoAlvo, today: appTodayIso() });
}

function formatHoraEnvio(hora: string | null) {
  const clean = String(hora ?? "").trim();
  if (!clean) return "-";
  const match = clean.match(/^(\d{2}:\d{2})/);
  return match?.[1] ?? clean;
}

function formatDiasSemana(dias: string | null) {
  const nomesZeroBase = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const nomesOneBase = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const valores = String(dias ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!valores.length) return [];

  const numeros = valores.map(Number);
  const usarOneBase = numeros.every((n) => Number.isInteger(n) && n >= 1 && n <= 7);

  return valores.map((item) => {
    const index = Number(item);
    if (!Number.isInteger(index)) return item;
    if (usarOneBase) return nomesOneBase[index - 1] ?? item;
    return nomesZeroBase[index] ?? item;
  });
}
