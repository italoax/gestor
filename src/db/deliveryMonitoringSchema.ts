import { execute } from './mysql.ts';
let ready: Promise<void> | undefined;
export function ensureDeliveryMonitoringSchema() {
  return (ready ??= initialize().catch((error) => {
    ready = undefined;
    throw error;
  }));
}
async function initialize() {
  await execute(`CREATE TABLE IF NOT EXISTS automation_delivery_attempts (
    id CHAR(36) NOT NULL PRIMARY KEY,
    user_id INT NOT NULL, cobranca_id INT NOT NULL, cliente_id INT NOT NULL,
    regra_titulo VARCHAR(190) NOT NULL, origem VARCHAR(16) NOT NULL,
    programado_em DATETIME NULL, iniciado_em DATETIME NOT NULL, concluido_em DATETIME NULL,
    status VARCHAR(20) NOT NULL, erro VARCHAR(2000) NULL,
    INDEX automation_attempts_owner_time (user_id, iniciado_em),
    INDEX automation_attempts_rule_time (cobranca_id, iniciado_em)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await execute(`CREATE TABLE IF NOT EXISTS automation_incidents (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL, incident_key VARCHAR(100) NOT NULL,
    titulo VARCHAR(190) NOT NULL, mensagem VARCHAR(2000) NOT NULL, url VARCHAR(255) NOT NULL,
    first_seen DATETIME NOT NULL, last_seen DATETIME NOT NULL, resolved_at DATETIME NULL,
    notification_id INT NULL,
    UNIQUE KEY automation_incident_owner (user_id, incident_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
