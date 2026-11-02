import { execute } from './mysql.ts';

let ready: Promise<void> | undefined;
export function ensureClientMutationOperationsSchema() {
  return (ready ??=
    execute(`CREATE TABLE IF NOT EXISTS client_mutation_operations (
    user_id INT NOT NULL, operation_hash CHAR(64) NOT NULL,
    claim_token CHAR(36) NOT NULL, status VARCHAR(16) NOT NULL,
    result_json MEDIUMTEXT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    PRIMARY KEY (user_id, operation_hash),
    INDEX client_operations_cleanup (status, completed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
      .then(() => {})
      .catch((error) => {
        ready = undefined;
        throw error;
      }));
}
