-- Schema inicial do Gestor Node para MySQL/Hostinger
-- Banco alvo: u708755686_gestor
-- Importe este arquivo no phpMyAdmin da Hostinger.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  username VARCHAR(60) NOT NULL,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_username (username),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS planos (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS servidores (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mensagens (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  nome VARCHAR(160) NOT NULL,
  `user` VARCHAR(120) NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cobrancas (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cobrancas_envios (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
