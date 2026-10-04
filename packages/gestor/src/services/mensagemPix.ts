import type { RowDataPacket } from "mysql2";
import { queryOne } from "../db/mysql.js";
import { enviarMensagemModeloComRetry } from "./whatsapp.js";
import { getPixConfig } from "./pixConfig.js";

export async function enviarConfirmacaoPix(userId: number, clienteId: number): Promise<boolean> {
  const mensagem = await queryOne<RowDataPacket>(
    `SELECT m.mensagem, m.media_tipo AS mediaTipo, m.media_path AS mediaPath
       FROM users u JOIN mensagens m ON m.id = u.mensagem_pix_confirmado_id AND m.user_id = u.id
      WHERE u.id = :userId`, { userId });
  if (!mensagem) return false;
  const cliente = await queryOne<RowDataPacket>("SELECT * FROM clientes WHERE id = :clienteId AND user_id = :userId AND arquivado = 0", { clienteId, userId });
  if (!cliente) return false;
  const dispositivo = await queryOne<RowDataPacket>("SELECT sessao FROM whatsapp_devices WHERE user_id = :userId ORDER BY principal DESC, id ASC LIMIT 1", { userId });
  if (!dispositivo?.sessao) throw new Error("Nenhum dispositivo WhatsApp configurado para confirmar o PIX.");
  const resultado = await enviarMensagemModeloComRetry(dispositivo.sessao, cliente,
    { mensagem: mensagem.mensagem, mediaTipo: mensagem.mediaTipo, mediaPath: mensagem.mediaPath },
    undefined, undefined, await getPixConfig(userId));
  if (!resultado.ok) throw new Error(resultado.error || "Falha no envio da confirmação do PIX.");
  return true;
}
