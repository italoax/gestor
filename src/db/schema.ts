import { execute, queryRows } from "./mysql.js";
import type { RowDataPacket } from "mysql2";

let schemaReady: Promise<void> | null = null;

interface ColumnRow extends RowDataPacket { COLUMN_NAME: string; }

// Colunas novas da tabela `clientes` (adicionadas após o CREATE original).
// Definidas aqui e aplicadas via ALTER só nas que faltam (compatível com MySQL e MariaDB,
// que não compartilham o mesmo suporte a "ADD COLUMN IF NOT EXISTS").
// Configurações de integração de pagamento ficam direto na tabela users (1:1).
// Cada usuário do painel pluga a própria conta Mercado Pago.
const usersNovasColunas: Array<[string, string]> = [
  ["mensagem_pix_confirmado_id", "INT NULL"],
  // Preferência da renovação manual, compartilhada entre dispositivos da conta.
  ["mensagem_pagamento_padrao_id", "INT NULL"],
  // mp_access_token vira legado — credenciais agora ficam em payment_provider_configs.
  // Mantido pra não quebrar nada antes da migração rodar e poder copiar dali.
  ["mp_access_token", "VARCHAR(255) NULL"],
  // Telefone (com DDI) que vai receber a notificação WhatsApp quando um cliente
  // pagar via /pagar. Sem isso, mandamos pro número conectado da sessão.
  ["notification_phone", "VARCHAR(60) NULL"],
  // Qual provedor de pagamento usar pros links públicos. Valores: mercadopago,
  // asaas, openpix. Se null e tiver só um config ativo, usa esse.
  ["provider_padrao", "VARCHAR(40) NULL"],
  // Auto-renovação: quando 1, ao confirmar pagamento PIX o cliente é renovado
  // automaticamente (vencimento estendido + crédito consumido + transação criada).
  // Default 0 pra não surpreender quem já usa o fluxo manual.
  ["auto_renovar", "TINYINT(1) NOT NULL DEFAULT 0"],
  // Template de mensagem disparado pelo WhatsApp na auto-renovação. NULL = não envia.
  ["mensagem_renovacao_id", "INT NULL"],
  // Assinatura do GESTOR: cada user paga uma mensalidade pra usar o painel.
  // is_admin distingue o dono do sistema (libera /admin/* e nunca expira).
  // plano_id aponta pro assinatura_planos. NULL = sem plano (trial novo).
  // assinatura_vencimento DATE — quando <= hoje, middleware bloqueia tudo
  // exceto /meu-plano e rotas seguras (logout, push, static).
  ["is_admin", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["plano_id", "INT NULL"],
  ["assinatura_vencimento", "DATE NULL"],
  // Chave PIX estatica do usuario (dono do gestor) pra inserir nas mensagens
  // via tag {pix}. Texto copiavel — nao e o PIX dinamico do Mercado Pago.
  ["pix_chave", "VARCHAR(160) NULL"],
  ["pix_nome", "VARCHAR(120) NULL"],
  ["pix_tipo", "VARCHAR(30) NULL"],
];

const clientesNovasColunas: Array<[string, string]> = [
  ["pagamento_curto", "VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NULL UNIQUE"],
  ["portal_bloqueado", "TINYINT(1) NOT NULL DEFAULT 0"],
  ["portal_login", "VARCHAR(120) NULL UNIQUE"],
  ["portal_hash", "VARCHAR(255) NULL"],
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
  // Token público pro link de pagamento direto (/pagar/<token>).
  // 32 chars hex = 128 bits, suficiente pra impedir enumeração.
  ["pagamento_token", "VARCHAR(64) NULL"],
  // ID do cliente no painel externo (ex.: Sigma/dashgen), usado pra renovar lá
  // automaticamente quando renova aqui. NULL = sem vínculo com painel.
  ["sigma_customer_id", "VARCHAR(120) NULL"],
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
  // Mapeamento pro painel externo (Sigma): qual pacote (package_id) e quantas
  // conexões esse plano representa lá. Usado na renovação automática no painel.
  ["sigma_package_id", "VARCHAR(120) NULL"],
  ["sigma_connections", "INT NOT NULL DEFAULT 1"],
];

const mensagensNovasColunas: Array<[string, string]> = [
  ["descricao", "VARCHAR(255) NULL"],
];

const pagamentosNovasColunas: Array<[string, string]> = [
  ["provider", "VARCHAR(40) NOT NULL DEFAULT 'mercadopago'"],
  ["renovacao_periodos", "INT NOT NULL DEFAULT 1"],
  ["renovacao_dados", "TEXT NULL"],
  ["renovado_em", "DATETIME NULL"],
];

const whatsappStatusNovasColunas: Array<[string, string]> = [
  // Quando agendado (status='agendado'), guarda a hora-alvo de publicação.
  ["agendado_para", "DATETIME NULL"],
  // Guarda o arquivo (data URL base64) só pra status agendados; é limpo após postar.
  // MEDIUMTEXT cobre até ~16MB (mais que o limite de upload de 5MB + overhead).
  ["media_data", "MEDIUMTEXT NULL"],
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

  `CREATE TABLE IF NOT EXISTS whatsapp_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'text',
    texto TEXT NULL,
    cor_fundo VARCHAR(20) NULL,
    fonte INT NULL,
    media_url VARCHAR(500) NULL,
    legenda VARCHAR(500) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'postado',
    erro TEXT NULL,
    destinatarios INT NULL,
    postado_em TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_whatsapp_status_user (user_id),
    KEY idx_whatsapp_status_created (created_at),
    CONSTRAINT fk_whatsapp_status_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

  // Inscrição de push notification por device do usuário. Cada navegador/aparelho
  // gera uma inscrição própria (endpoint único). Guardamos a tripla
  // (endpoint, p256dh, auth) que o web-push precisa pra enviar mensagem.
  // UNIQUE no endpoint evita salvar a mesma inscrição 2x se o user reabilita.
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_push_endpoint (endpoint),
    KEY idx_push_user (user_id),
    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  `CREATE TABLE IF NOT EXISTS whatsapp_webhook_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    payload LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_whatsapp_webhook_events_created_at (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Configuração por provedor de pagamento. Credenciais em JSON pra não ter que
  // adicionar coluna nova cada vez que entrar provedor (cada um tem campos diferentes:
  // MP só tem access_token, Asaas tem token + ambiente, OpenPix tem app_id, etc).
  // PK composta (user_id, provider) garante 1 config por par.
  `CREATE TABLE IF NOT EXISTS payment_provider_configs (
    user_id INT NOT NULL,
    provider VARCHAR(40) NOT NULL,
    credenciais TEXT NOT NULL,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, provider),
    CONSTRAINT fk_ppc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Notificações que aparecem no sininho do topbar. Persistem mesmo que o user
  // não receba o push (browser sem permissão, dispositivo offline, etc).
  // tipo: "pagamento" | "status" | "cobranca" | "sistema" — define o ícone.
  // url: pra onde leva ao clicar na notificação no painel.
  `CREATE TABLE IF NOT EXISTS notificacoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    titulo VARCHAR(190) NOT NULL,
    mensagem TEXT NULL,
    tipo VARCHAR(40) NOT NULL DEFAULT 'sistema',
    url VARCHAR(255) NULL,
    icone VARCHAR(10) NULL,
    lida TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_notif_user (user_id),
    KEY idx_notif_user_lida (user_id, lida),
    KEY idx_notif_created (created_at),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Cada pedido de pagamento (PIX dinâmico, qualquer provedor) gera uma linha aqui.
  // mp_payment_id é o ID do MP — vem no webhook, usado pra consultar status.
  // status acompanha o ciclo: pending -> approved | rejected | cancelled | expired.
  // user_notificado avisa se já mandamos WhatsApp pro dono (idempotência).
  `CREATE TABLE IF NOT EXISTS pagamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    cliente_id INT NOT NULL,
    valor DECIMAL(12,2) NOT NULL,
    descricao VARCHAR(255) NULL,
    mp_payment_id VARCHAR(40) NULL,
    mp_qr_text TEXT NULL,
    mp_qr_base64 MEDIUMTEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    pago_em DATETIME NULL,
    expirado_em DATETIME NULL,
    user_notificado TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_pagamentos_user (user_id),
    KEY idx_pagamentos_cliente (cliente_id),
    KEY idx_pagamentos_status (status),
    KEY idx_pagamentos_mp_id (mp_payment_id),
    CONSTRAINT fk_pagamentos_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_pagamentos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Planos de assinatura DO GESTOR (master). O dono (is_admin=1) edita os
  // valores em /admin/planos. Cada user escolhe um pra ativar a conta.
  // dias_validade = quantos dias estende ao pagar (default 30 = mensal).
  `CREATE TABLE IF NOT EXISTS assinatura_planos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(80) NOT NULL,
    preco DECIMAL(10,2) NOT NULL,
    descricao TEXT NULL,
    dias_validade INT NOT NULL DEFAULT 30,
    ativo TINYINT(1) NOT NULL DEFAULT 1,
    ordem INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Log de cada PIX gerado pra assinatura. Separado de "pagamentos" (que e
  // dos clientes IPTV) porque a credencial usada e a master, nao a do user.
  `CREATE TABLE IF NOT EXISTS assinatura_pagamentos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    plano_id INT NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    dias_validade INT NOT NULL,
    mp_payment_id VARCHAR(40) NULL,
    mp_qr_text TEXT NULL,
    mp_qr_base64 MEDIUMTEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    pago_em DATETIME NULL,
    expira_em DATETIME NULL,
    aplicado TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_assinatura_pag_user (user_id),
    KEY idx_assinatura_pag_mp (mp_payment_id),
    KEY idx_assinatura_pag_status (status),
    CONSTRAINT fk_assinatura_pag_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_assinatura_pag_plano FOREIGN KEY (plano_id) REFERENCES assinatura_planos(id) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Controle de idempotencia dos alertas de vencimento da assinatura. O cron
  // roda a cada minuto; sem isso, mandaria push repetido o dia todo. A UNIQUE
  // (user_id, vencimento, dias) garante que cada alerta (ex.: "faltam 3 dias"
  // pra um vencimento especifico) dispare uma unica vez.
  `CREATE TABLE IF NOT EXISTS assinatura_alertas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    vencimento DATE NOT NULL,
    dias INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_assinatura_alertas (user_id, vencimento, dias),
    CONSTRAINT fk_assinatura_alertas_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Integrações com painéis IPTV externos (ex.: Sigma/dashgen). Guarda as
  // credenciais do painel pra logar e renovar clientes lá automaticamente.
  // A senha vai CRIPTOGRAFADA (AES-GCM) em senha_enc — nunca em texto puro.
  `CREATE TABLE IF NOT EXISTS integracoes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    tipo VARCHAR(40) NOT NULL DEFAULT 'sigma',
    nome VARCHAR(160) NOT NULL,
    api_url TEXT NOT NULL,
    username VARCHAR(190) NOT NULL,
    senha_enc TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_integracoes_user (user_id),
    KEY idx_integracoes_user_tipo (user_id, tipo),
    CONSTRAINT fk_integracoes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      await migrarColunas("whatsapp_status", whatsappStatusNovasColunas);
      await migrarColunas("users", usersNovasColunas);
      await migrarColunas("pagamentos", pagamentosNovasColunas);
      await migrarColunas("notificacoes", [["pagamento_id", "INT NULL UNIQUE"]]);

      // Migração: se o usuário tinha mp_access_token na tabela users (esquema antigo)
      // e ainda não tem config em payment_provider_configs, copia pra lá.
      // Idempotente — INSERT IGNORE não duplica se a config já existir.
      await execute(
        `INSERT IGNORE INTO payment_provider_configs (user_id, provider, credenciais, ativo)
         SELECT id, 'mercadopago', JSON_OBJECT('access_token', mp_access_token), 1
           FROM users
          WHERE mp_access_token IS NOT NULL AND mp_access_token <> ''`,
      ).catch(() => undefined);
      // E define mercadopago como provider_padrao pra quem só tinha MP configurado.
      await execute(
        `UPDATE users SET provider_padrao = 'mercadopago'
          WHERE provider_padrao IS NULL AND mp_access_token IS NOT NULL AND mp_access_token <> ''`,
      ).catch(() => undefined);

      // Seed do plano padrao: um unico plano mensal. O front oferece seletor
      // de duracao (1/3/6/12 meses) que multiplica valor e validade na hora
      // de gerar o PIX.
      const planosExistentes = await queryRows<RowDataPacket & { total: number }>(
        `SELECT COUNT(*) AS total FROM assinatura_planos`,
      );
      if (Number(planosExistentes[0]?.total ?? 0) === 0) {
        await execute(
          `INSERT INTO assinatura_planos (nome, preco, descricao, dias_validade, ativo, ordem) VALUES
             ('Acesso completo', 29.99, 'Acesso a todas as funcionalidades do painel.', 30, 1, 1)`,
        );
      } else {
        // Migracao pra instalacoes que ja rodaram o seed antigo dos 3 planos:
        // desativa Basico e Enterprise (mantem registros pra historico) e
        // renomeia Pro pra "Acesso completo". So aplica se os nomes ainda
        // estiverem como seedados originalmente (preserva customizacoes).
        await execute(
          `UPDATE assinatura_planos SET ativo = 0
            WHERE nome IN ('Basico', 'Enterprise')`,
        ).catch(() => undefined);
        await execute(
          `UPDATE assinatura_planos SET nome = 'Acesso completo',
                  descricao = 'Acesso a todas as funcionalidades do painel.',
                  preco = 29.99
            WHERE nome IN ('Pro', 'Acesso completo') AND preco IN (50.00, 30.00)`,
        ).catch(() => undefined);
      }

      // Migracao: usuarios existentes sem vencimento ganham 3 dias de trial
      // a partir de hoje (so quem ainda nao tem nada setado).
      await execute(
        `UPDATE users SET assinatura_vencimento = DATE_ADD(CURDATE(), INTERVAL 3 DAY)
          WHERE assinatura_vencimento IS NULL`,
      ).catch(() => undefined);
    })();
  }
  return schemaReady;
}
