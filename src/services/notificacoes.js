import { execute, queryOne, queryRows, withTransaction } from '../db/mysql.js';
import { enviarPushParaUsuario } from './push.js';
// Mantém a interface dos produtores existentes, mas só créditos geram alertas.
export async function notificar(userId, payload) {
  if (payload.pushTag?.startsWith('creditos-'))
    await sincronizarAlertasCreditos(userId);
}
export async function listarNotificacoes(userId, limite = 30) {
  return queryRows(
    `SELECT id, titulo, mensagem, tipo, url, icone, lida, created_at AS createdAt,
            CASE WHEN tipo = 'renovacao_pendente' THEN pagamento_id ELSE NULL END AS pagamentoId
       FROM notificacoes WHERE user_id = :userId AND tipo IN ('creditos', 'renovacao_pendente', 'pagamento') AND lida <> 2
       ORDER BY (tipo = 'renovacao_pendente') DESC, id DESC LIMIT :limite`,
    { userId, limite },
  );
}
export async function contarNaoLidas(userId) {
  const row = await queryOne(
    `SELECT COUNT(*) AS total FROM notificacoes WHERE user_id = :userId AND tipo IN ('creditos', 'renovacao_pendente', 'pagamento') AND lida = 0`,
    { userId },
  );
  return Number(row?.total ?? 0);
}
export async function marcarTodasLidas(userId) {
  await execute(
    `UPDATE notificacoes SET lida = 1 WHERE user_id = :userId AND lida = 0`,
    { userId },
  );
}
export async function marcarLida(userId, id) {
  await execute(
    `UPDATE notificacoes SET lida = 1 WHERE id = :id AND user_id = :userId AND lida = 0`,
    { id, userId },
  );
}
export async function excluirNotificacao(userId, id) {
  await execute(
    `UPDATE notificacoes SET lida = 2 WHERE id = :id AND user_id = :userId AND tipo IN ('creditos', 'pagamento')`,
    { id, userId },
  );
}
export async function limparTodas(userId) {
  await execute(
    `UPDATE notificacoes SET lida = 2 WHERE user_id = :userId AND tipo IN ('creditos', 'pagamento')`,
    { userId },
  );
}
// Um alerta por servidor enquanto o saldo estiver baixo. lida=2 representa
// dispensado: não reaparece a cada poll, mas volta se o saldo chegar a zero.
export async function sincronizarAlertasCreditos(userId) {
  const pushes = await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = :userId FOR UPDATE', {
      userId,
    });
    const [servidores] = await conn.query(
      'SELECT id, nome, creditos FROM servidores WHERE user_id = :userId AND creditos <= 3',
      { userId },
    );
    const [anteriores] = await conn.query(
      "SELECT id, titulo, url, lida FROM notificacoes WHERE user_id = :userId AND tipo = 'creditos' FOR UPDATE",
      { userId },
    );
    const ativos = new Set(
      servidores.map((s) => `/servidores#servidor-${s.id}`),
    );
    for (const anterior of anteriores) {
      if (!ativos.has(anterior.url ?? '')) {
        await conn.execute(
          'DELETE FROM notificacoes WHERE id = :id AND user_id = :userId',
          { id: anterior.id, userId },
        );
      }
    }
    const pushes = [];
    for (const servidor of servidores) {
      const saldo = Number(servidor.creditos);
      const url = `/servidores#servidor-${servidor.id}`;
      const titulo = (
        saldo <= 0
          ? `Sem créditos: ${servidor.nome}`
          : `Créditos acabando: ${servidor.nome}`
      ).slice(0, 190);
      const mensagem =
        saldo <= 0
          ? 'Recarregue os créditos deste painel para voltar a renovar clientes.'
          : `Restam ${saldo} crédito(s) neste painel. Recarregue antes da próxima renovação.`;
      const anterior = anteriores.find((n) => n.url === url);
      const novoAviso =
        !anterior ||
        (saldo <= 0 && !anterior.titulo.startsWith('Sem créditos:'));
      if (anterior) {
        await conn.execute(
          `UPDATE notificacoes SET titulo = :titulo, mensagem = :mensagem,
             lida = IF(:novoAviso, 0, lida), created_at = IF(:novoAviso, CURRENT_TIMESTAMP, created_at)
           WHERE id = :id AND user_id = :userId`,
          { id: anterior.id, userId, titulo, mensagem, novoAviso },
        );
      } else {
        await conn.execute(
          `INSERT INTO notificacoes (user_id, titulo, mensagem, tipo, url)
           VALUES (:userId, :titulo, :mensagem, 'creditos', :url)`,
          { userId, titulo, mensagem, url },
        );
      }
      if (novoAviso)
        pushes.push({
          title: titulo,
          body: mensagem,
          url,
          tag: `creditos-${servidor.id}`,
        });
    }
    return pushes;
  });
  await Promise.all(
    pushes.map((push) =>
      enviarPushParaUsuario(userId, push).catch((error) =>
        console.warn('[creditos] push falhou:', error),
      ),
    ),
  );
}
