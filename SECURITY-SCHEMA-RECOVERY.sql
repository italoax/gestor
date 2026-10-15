-- DELTA REVISADO: aplicado pelo CLI autorizado em 15/10/2026, nao por importacao deste arquivo.
-- Gerado com metadados de 15/10/2026; revalidar antes de aplicar.
-- Nao importar este arquivo diretamente: usar o CLI versionado com trava e aprovacao.
-- Sem --business; nenhuma migracao comercial. DDL pode causar commit implicito.

CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(80) PRIMARY KEY, checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS security_rate_limits (
    bucket VARCHAR(40) NOT NULL, key_hash CHAR(64) NOT NULL, hits INT UNSIGNED NOT NULL DEFAULT 0,
    reset_at BIGINT UNSIGNED NOT NULL, PRIMARY KEY (bucket, key_hash), KEY idx_security_rate_expiry (reset_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=ascii;

CREATE TABLE IF NOT EXISTS security_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    event VARCHAR(60) NOT NULL, severity VARCHAR(12) NOT NULL, user_id INT NULL,
    source_hash CHAR(64) NULL, reason VARCHAR(60) NULL, count_value INT UNSIGNED NULL,
    KEY idx_security_events_created (created_at), KEY idx_security_events_user (user_id, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS auth_login_attempts (
    user_id INT PRIMARY KEY,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    reset_at BIGINT UNSIGNED NOT NULL,
    CONSTRAINT fk_auth_login_attempts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `users` ADD COLUMN `session_version` INT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE `clientes` MODIFY `senha` TEXT NULL;

ALTER TABLE `users` MODIFY `mp_access_token` TEXT NULL;

ALTER TABLE `pagamentos` MODIFY `mp_payment_id` VARCHAR(200) NULL;

ALTER TABLE `pagamentos` ADD COLUMN `external_reference` VARCHAR(200) NULL;

INSERT INTO schema_migrations (version, checksum) VALUES ('20261015-31-structural', '26f37ebfe9f77d3a717ceb43c76afd79d4c0a6e437afc8ffd6389ee36fc2d615');
