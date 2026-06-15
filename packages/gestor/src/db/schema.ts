import { execute, queryRows } from "./mysql.js";
import type { RowDataPacket } from "mysql2";

let schemaReady: Promise<void> | null = null;

interface ColumnRow extends RowDataPacket { COLUMN_NAME: string; }

// Colunas novas da tabela `clientes` (adicionadas após o CREATE original).
// Definidas aqui e aplicadas via ALTER só nas que faltam (compatível com MySQL e MariaDB,
// que não compartilham o mesmo suporte a "ADD COLUMN IF NOT EXISTS").
const clientesNovasColunas: Array<[string, string]> = [
  ["senha", "VARCHAR(190) NULL"],
  ["id_painel", "VARCHAR(120) NULL"],
  ["email", "VARCHAR(190) NULL"],
  ["captacao", "VARCHAR(120) NULL"],
  ["aniversario", "DATE NULL"],
  ["link_m3u", "TEXT NULL"],
  ["time_cliente", "VARCHAR(120) NULL"],
  ["telefone_secundario", "VARCHAR(60) NULL"],
  ["observacoes", "TEXT NULL"],
  ["data_inicio", "DATE NULL"],
  ["hora_vencimento", "TIME NULL"],
  ["sistema_painel", "VARCHAR(120) NULL"],
  ["pontos_fidelidade", "INT NOT NULL DEFAULT 0"],
  ["bloquear_notificacoes", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["enviar_boas_vindas", "TINYINT(1) NOT NULL DEFAULT 1"],
  ["dispositivo", "VARCHAR(120) NULL"],
  ["aplicativo", "VARCHAR(120) NULL"],
  ["arquivado", "TINYINT(1) NOT NULL DEFAULT 0"],
];

const servidoresNovasColunas: Array<[string, string]> = [
  ["identificador", "VARCHAR(120) NULL"],
  ["link_painel", "TEXT NULL"],
  ["cobranca_por_telas", "TINYINT(1) NOT NULL DEFAULT 1"],
  ["observacao_servidor", "TEXT NULL"],
  ["renovacao_automatica", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["dispositivo_whatsapp", "VARCHAR(120) NULL"],
  ["url_app_android", "TEXT NULL"],
  ["url_app_ios", "TEXT NULL"],
  ["info_servidor", "TEXT NULL"],
  ["dns_1", "VARCHAR(190) NULL"],
  ["dns_2", "VARCHAR(190) NULL"],
  ["dns_3", "VARCHAR(190) NULL"],
  ["dns_4", "VARCHAR(190) NULL"],
  ["url_api_xc", "TEXT NULL"],
  ["url_api_smarters", "TEXT NULL"],
  ["epg", "TEXT NULL"],
  ["pix", "VARCHAR(190) NULL"],
  ["pix_nome", "VARCHAR(160) NULL"],
  ["pix_tipo", "VARCHAR(60) NULL"],
  ["url_renovacao", "TEXT NULL"],
];

const planosNovasColunas: Array<[string, string]> = [
  ["ativo", "TINYINT(1) NOT NULL DEFAULT 1"],
];

const mensagensNovasColunas: Array<[string, string]> = [
  ["descricao", "VARCHAR(255) NULL"],
];

const cobrancasNovasColunas: Array<[string, string]> = [
  ["descricao", "VARCHAR(255) NULL"],
  ["gatilho", "VARCHAR(40) NOT NULL DEFAULT 'plano'"],
  ["min_delay", "INT NULL"],
  ["max_delay", "INT NULL"],
  ["envio_lotes", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["lote_tamanho", "INT NOT NULL DEFAULT 20"],
  ["lote_pausa", "INT NOT NULL DEFAULT 60"],
  ["rodape_antiban", "TINYINT(1) NOT NULL DEFAULT 1"],
  ["filtro_servidor", "VARCHAR(120) NULL"],
  ["filtro_plano", "VARCHAR(120) NULL"],
  ["filtro_arquivados", "VARCHAR(20) NULL"],
];

// Aplica ALTER só nas colunas que faltam (compatível com MySQL e MariaDB).
async function migrarColunas(tabela: string, colunas: Array<[string, string]>) {
  const existentes = await queryRows<ColumnRow>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :tabela`,
    { tabela },
  );
  const presentes = new Set(existentes.map((r) => String(r.COLUMN_NAME).toLowerCase()));
  for (const [coluna, definicao] of colunas) {
    if (presentes.has(coluna.toLowerCase())) continue;
    await execute(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao}`);
  }
}

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(60) NOT NULL,
    email VARCHAR(190) NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_username (username),
    UNIQUE KEY uq_users_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS planos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    tipo VARCHAR(40) NOT NULL DEFAULT 'Mês',
    periodo INT NOT NULL DEFAULT 1,
    credito_gastos DECIMAL(12,2) NOT NULL DEFAULT 0,
    clientes INT NOT NULL DEFAULT 0,
    observacao TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_planos_user (user_id),
    CONSTRAINT fk_planos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS servidores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    clientes_total INT NOT NULL DEFAULT 0,
    clientes_ativos INT NOT NULL DEFAULT 0,
    clientes_inativos INT NOT NULL DEFAULT 0,
    testes_total INT NOT NULL DEFAULT 0,
    testes_ativos INT NOT NULL DEFAULT 0,
    testes_inativos INT NOT NULL DEFAULT 0,
    creditos DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_cred DECIMAL(12,2) NOT NULL DEFAULT 0,
    sessao VARCHAR(120) NOT NULL DEFAULT 'Não definido',
    integracao VARCHAR(120) NOT NULL DEFAULT 'Não definida',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_servidores_user (user_id),
    CONSTRAINT fk_servidores_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS mensagens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    titulo VARCHAR(160) NOT NULL,
    mensagem TEXT NULL,
    media_tipo VARCHAR(40) NULL,
    media_path TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_mensagens_user (user_id),
    CONSTRAINT fk_mensagens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    nome VARCHAR(160) NOT NULL,
    \`user\` VARCHAR(120) NOT NULL,
    telefone VARCHAR(60) NOT NULL,
    vencimento DATE NOT NULL,
    plano VARCHAR(120) NOT NULL DEFAULT '',
    valor DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'Ativo',
    servidor VARCHAR(120) NOT NULL DEFAULT '',
    telas INT NOT NULL DEFAULT 1,
    creditos_gastos DECIMAL(12,2) NOT NULL DEFAULT 0,
    pago_em DATETIME NULL,
    valor_pago DECIMAL(12,2) NULL,
    forma_pagamento VARCHAR(80) NULL,
    custo_pagamento DECIMAL(12,2) NULL,
    observacao_pagamento TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_clientes_user (user_id),
    KEY idx_clientes_vencimento (vencimento),
    KEY idx_clientes_status (status),
    CONSTRAINT fk_clientes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS cobrancas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    titulo VARCHAR(160) NOT NULL,
    tipo VARCHAR(40) NOT NULL DEFAULT 'Vencimento',
    tipo_periodo VARCHAR(40) NOT NULL DEFAULT 'Dias',
    periodo INT NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'Ativo',
    automatica TINYINT(1) NOT NULL DEFAULT 0,
    ultima_execucao DATETIME NULL,
    mensagem_id INT NULL,
    hora_envio TIME NULL DEFAULT '09:00:00',
    dias_semana VARCHAR(60) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_cobrancas_user (user_id),
    KEY idx_cobrancas_mensagem (mensagem_id),
    KEY idx_cobrancas_status (status),
    CONSTRAINT fk_cobrancas_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cobrancas_mensagem FOREIGN KEY (mensagem_id) REFERENCES mensagens(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS cobrancas_envios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cobranca_id INT NOT NULL,
    cliente_id INT NOT NULL,
    data_envio DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente',
    erro TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cobranca_cliente_data (cobranca_id, cliente_id, data_envio),
    KEY idx_cobrancas_envios_cliente (cliente_id),
    KEY idx_cobrancas_envios_status (status),
    CONSTRAINT fk_cobrancas_envios_cobranca FOREIGN KEY (cobranca_id) REFERENCES cobrancas(id) ON DELETE CASCADE,
    CONSTRAINT fk_cobrancas_envios_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS transacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    data DATE NOT NULL,
    forma_pagamento VARCHAR(80) NULL,
    cliente_id INT NULL,
    cliente_nome VARCHAR(160) NULL,
    descricao VARCHAR(255) NULL,
    plano VARCHAR(120) NULL,
    servidor VARCHAR(120) NULL,
    telas INT NOT NULL DEFAULT 1,
    creditos DECIMAL(12,2) NOT NULL DEFAULT 0,
    custo DECIMAL(12,2) NOT NULL DEFAULT 0,
    valor_venda DECIMAL(12,2) NOT NULL DEFAULT 0,
    lucro DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_transacoes_user (user_id),
    KEY idx_transacoes_data (data),
    CONSTRAINT fk_transacoes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS dispositivos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    descricao VARCHAR(255) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_dispositivos_user (user_id),
    CONSTRAINT fk_dispositivos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS aplicativos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    descricao VARCHAR(255) NULL,
    valor_renovacao DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'Ativo',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_aplicativos_user (user_id),
    CONSTRAINT fk_aplicativos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS whatsapp_devices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    nome VARCHAR(120) NOT NULL,
    sessao VARCHAR(120) NOT NULL,
    bloqueio_chamadas TINYINT(1) NOT NULL DEFAULT 0,
    principal TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_wa_devices_user (user_id),
    CONSTRAINT fk_wa_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS user_seeds (
    user_id INT NOT NULL,
    chave VARCHAR(60) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, chave),
    CONSTRAINT fk_user_seeds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payload LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_whatsapp_webhook_events_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

export function ensureDatabaseSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of statements) {
        await execute(statement);
      }
      await migrarColunas("clientes", clientesNovasColunas);
      await migrarColunas("servidores", servidoresNovasColunas);
      await migrarColunas("planos", planosNovasColunas);
      await migrarColunas("mensagens", mensagensNovasColunas);
      await migrarColunas("cobrancas", cobrancasNovasColunas);
    })();
  }
  return schemaReady;
}
