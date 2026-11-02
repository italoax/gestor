import { utcTimestamp } from '../shared/displayDate.ts';

export async function ensureClientHistorySchema(execute) {
  await execute(`CREATE TABLE IF NOT EXISTS client_activity (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, cliente_id INT NOT NULL,
    tipo VARCHAR(24) NOT NULL, titulo VARCHAR(190) NOT NULL,
    detalhe VARCHAR(1000) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX client_activity_owner_time (user_id, cliente_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export function createClientActivityWriter(execute) {
  return async (
    event: {
      userId: number;
      clientId: number;
      type: string;
      title: string;
      detail?: string;
    },
    connection?,
  ) => {
    const sql = `INSERT INTO client_activity (user_id, cliente_id, tipo, titulo, detalhe)
      VALUES (:userId, :clientId, :type, :title, :detail)`;
    const values = {
      ...event,
      title: event.title.slice(0, 190),
      detail: (event.detail || '').slice(0, 1000),
    };
    if (connection) await connection.execute(sql, values);
    else await execute(sql, values);
  };
}

export async function readClientHistory(db, userId: number, rawId: unknown) {
  const clientId = Number(rawId);
  if (!Number.isSafeInteger(clientId) || clientId < 1) return null;
  const client = await db.queryOne(
    'SELECT id, nome, created_at AS createdAt FROM clientes WHERE id = :clientId AND user_id = :userId LIMIT 1',
    { clientId, userId },
  );
  if (!client) return null;
  const params = { clientId, userId };
  const [activities, transactions, payments, messages] = await Promise.all([
    db.queryRows(
      'SELECT id, tipo, titulo, detalhe, created_at AS occurredAt FROM client_activity WHERE user_id = :userId AND cliente_id = :clientId ORDER BY created_at DESC, id DESC LIMIT 30',
      params,
    ),
    db.queryRows(
      'SELECT id, descricao, plano, servidor, valor_venda AS amount, created_at AS occurredAt FROM transacoes WHERE user_id = :userId AND cliente_id = :clientId ORDER BY created_at DESC, id DESC LIMIT 30',
      params,
    ),
    db.queryRows(
      "SELECT id, valor AS amount, pago_em AS paidAt, renovado_em AS renewedAt FROM pagamentos WHERE user_id = :userId AND cliente_id = :clientId AND status = 'approved' ORDER BY id DESC LIMIT 30",
      params,
    ),
    db.queryRows(
      'SELECT id, regra_titulo AS title, status, iniciado_em AS occurredAt FROM automation_delivery_attempts WHERE user_id = :userId AND cliente_id = :clientId ORDER BY iniciado_em DESC LIMIT 30',
      params,
    ),
  ]);
  const events: any[] = [];
  const push = (key, type, title, detail, time, amount?) => {
    const occurredAt = utcTimestamp(time);
    if (occurredAt)
      events.push({
        key,
        type,
        title,
        detail,
        occurredAt,
        ...(amount == null ? {} : { amount: Number(amount) }),
      });
  };
  push('created', 'cadastro', 'Cliente cadastrado', '', client.createdAt);
  for (const row of activities)
    push(
      `activity-${row.id}`,
      row.tipo,
      row.titulo,
      row.detalhe,
      row.occurredAt,
    );
  for (const row of transactions)
    push(
      `transaction-${row.id}`,
      'transacao',
      row.descricao || 'Transação registrada',
      [row.plano, row.servidor].filter(Boolean).join(' · '),
      row.occurredAt,
      row.amount,
    );
  for (const row of payments) {
    push(
      `payment-${row.id}`,
      'pagamento',
      'Pagamento recebido',
      row.renewedAt ? 'Renovação confirmada' : 'Aguardando renovação',
      row.paidAt,
      row.amount,
    );
    if (row.renewedAt)
      push(
        `renewal-${row.id}`,
        'renovacao',
        'Renovação confirmada',
        '',
        row.renewedAt,
      );
  }
  const statusLabels = {
    enviado: 'Envio confirmado',
    nao_enviado: 'Não enviado',
    pendente: 'Em andamento',
    incerto: 'Sem confirmação',
  };
  for (const row of messages)
    push(
      `message-${row.id}`,
      'mensagem',
      row.title || 'Mensagem automática',
      statusLabels[row.status] || 'Confira o envio',
      row.occurredAt,
    );
  events.sort(
    (a, b) =>
      b.occurredAt.localeCompare(a.occurredAt) || a.key.localeCompare(b.key),
  );
  return {
    client: { id: client.id, name: client.nome },
    events: events.slice(0, 50),
    hasMore:
      events.length > 50 ||
      [activities, transactions, payments, messages].some(
        (rows) => rows.length === 30,
      ),
  };
}
