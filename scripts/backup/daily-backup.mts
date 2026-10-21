import { rodarBackupAgendado } from '../../src/services/backup.ts';
import { db } from '../../src/db/mysql.ts';
import { env } from '../../src/config/env.ts';
import { safeError } from '../../src/security/safeError.ts';

try {
  if (env.localMode) throw new Error('Backup diário desativado no modo local.');
  console.log(JSON.stringify(await rodarBackupAgendado()));
} catch (error) {
  console.error('Falha ao preparar o backup diário:', safeError(error));
  process.exitCode = 1;
} finally {
  await db.end();
}
