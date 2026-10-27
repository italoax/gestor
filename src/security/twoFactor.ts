import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';
import { credentialRevision } from '../services/sessionSecurity.ts';
import type { SecretVault } from './secretVault.ts';

export const TWO_FACTOR_CHALLENGE_MS = 5 * 60_000;
export const TWO_FACTOR_SETUP_MS = 10 * 60_000;
const ISSUER = 'Gestor IXTV';

export class TwoFactorError extends Error {}

export function authenticator(secret: string, username = 'conta') {
  return new TOTP({
    issuer: ISSUER,
    label: username.replace(/:/g, ''),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

export function validTotpStep(secret: string, code: unknown, now = Date.now()) {
  const token = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(token)) return null;
  const delta = authenticator(secret).validate({
    token,
    timestamp: now,
    window: 1,
  });
  return delta === null ? null : Math.floor(now / 30_000) + delta;
}

function recoveryHash(userId: number, code: string) {
  return createHash('sha256')
    .update(
      `totp-recovery:${userId}:${code.replace(/[-\s]/g, '').toLowerCase()}`,
    )
    .digest('hex');
}

function recoveryCodes(userId: number) {
  const codes = Array.from({ length: 10 }, () =>
    randomBytes(10).toString('hex').match(/.{4}/g)!.join('-'),
  );
  return { codes, hashes: codes.map((code) => recoveryHash(userId, code)) };
}

function hashesFrom(value: unknown): string[] {
  const hashes = typeof value === 'string' ? JSON.parse(value) : value;
  if (
    !Array.isArray(hashes) ||
    hashes.some((hash) => !/^[a-f0-9]{64}$/.test(hash))
  )
    throw new Error('Registro de recuperação inválido.');
  return hashes;
}

export function createTwoFactorService({
  queryOne,
  execute,
  withTransaction,
  vault,
  now = Date.now,
}: {
  queryOne: (sql: string, params?: any) => Promise<any>;
  execute: (sql: string, params?: any) => Promise<any>;
  withTransaction: <T>(action: (connection: any) => Promise<T>) => Promise<T>;
  vault: (create?: boolean) => SecretVault;
  now?: () => number;
}) {
  let ready: Promise<unknown> | undefined;
  const initialize = () =>
    (ready ??= execute(`CREATE TABLE IF NOT EXISTS user_two_factor (
    user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    secret TEXT NOT NULL,
    last_used_step BIGINT NOT NULL DEFAULT -1,
    recovery_hashes JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).catch((error) => {
      ready = undefined;
      throw error;
    }));

  async function status(userId: number) {
    await initialize();
    const row = await queryOne(
      'SELECT JSON_LENGTH(recovery_hashes) AS remaining FROM user_two_factor WHERE user_id = :userId',
      { userId },
    );
    return {
      enabled: Boolean(row),
      recoveryRemaining: Number(row?.remaining ?? 0),
    };
  }

  async function locked<T>(
    userId: number,
    revision: string,
    action: (connection: any, user: any, row: any) => Promise<T>,
  ) {
    await initialize();
    return withTransaction(async (connection) => {
      const [users] = await connection.query(
        'SELECT id, username, password_hash AS passwordHash, is_admin AS isAdmin, session_version AS sessionVersion FROM users WHERE id = :userId FOR UPDATE',
        { userId },
      );
      const user = users[0];
      if (!user || credentialRevision(user) !== revision)
        throw new TwoFactorError(
          'Sua conta mudou. Entre novamente para continuar.',
        );
      const [rows] = await connection.query(
        'SELECT secret, last_used_step AS lastStep, recovery_hashes AS recoveryHashes FROM user_two_factor WHERE user_id = :userId FOR UPDATE',
        { userId },
      );
      return action(connection, user, rows[0]);
    });
  }

  async function consume(
    connection: any,
    userId: number,
    row: any,
    code: unknown,
  ) {
    if (!row) return false;
    const secret = vault().open(row.secret, `totp:${userId}`);
    const step = validTotpStep(secret, code, now());
    if (step !== null && step > Number(row.lastStep)) {
      await connection.execute(
        'UPDATE user_two_factor SET last_used_step = :step WHERE user_id = :userId',
        { userId, step },
      );
      return true;
    }
    const normalized = String(code ?? '')
      .replace(/[-\s]/g, '')
      .toLowerCase();
    if (!/^[a-f0-9]{20}$/.test(normalized)) return false;
    const hashes = hashesFrom(row.recoveryHashes);
    const wanted = Buffer.from(recoveryHash(userId, normalized), 'hex');
    const index = hashes.findIndex((hash) =>
      timingSafeEqual(Buffer.from(hash, 'hex'), wanted),
    );
    if (index === -1) return false;
    hashes.splice(index, 1);
    await connection.execute(
      'UPDATE user_two_factor SET recovery_hashes = :hashes WHERE user_id = :userId',
      { userId, hashes: JSON.stringify(hashes) },
    );
    return true;
  }

  async function bumpRevision(connection: any, user: any) {
    await connection.execute(
      'UPDATE users SET session_version = session_version + 1 WHERE id = :id',
      { id: user.id },
    );
    return credentialRevision({
      ...user,
      sessionVersion: Number(user.sessionVersion || 0) + 1,
    });
  }

  return {
    initialize,
    status,
    async setup(userId: number, username: string) {
      if ((await status(userId)).enabled)
        throw new TwoFactorError(
          'A verificação em duas etapas já está ativada.',
        );
      const secret = new Secret({ size: 20 }).base32;
      const sealed = vault(true).seal(secret, `totp:${userId}`);
      const qrCode = await QRCode.toDataURL(
        authenticator(secret, username).toString(),
        { errorCorrectionLevel: 'M', margin: 2, width: 240 },
      );
      return { secret, sealed, qrCode };
    },
    async enable(
      userId: number,
      revision: string,
      sealed: string,
      code: unknown,
    ) {
      const secret = vault().open(sealed, `totp:${userId}`);
      const step = validTotpStep(secret, code, now());
      if (step === null)
        throw new TwoFactorError(
          'Código inválido. Confira o Google Authenticator e tente novamente.',
        );
      return locked(userId, revision, async (connection, user, row) => {
        if (row)
          throw new TwoFactorError(
            'A verificação em duas etapas já está ativada.',
          );
        const recovery = recoveryCodes(userId);
        await connection.execute(
          'INSERT INTO user_two_factor (user_id, secret, last_used_step, recovery_hashes) VALUES (:userId, :secret, :step, :hashes)',
          {
            userId,
            secret: sealed,
            step,
            hashes: JSON.stringify(recovery.hashes),
          },
        );
        const revision = await bumpRevision(connection, user);
        return { recoveryCodes: recovery.codes, revision };
      });
    },
    verify(userId: number, revision: string, code: unknown) {
      return locked(userId, revision, (connection, _user, row) =>
        consume(connection, userId, row, code),
      );
    },
    change(
      userId: number,
      revision: string,
      code: unknown,
      action: 'disable' | 'recovery',
    ) {
      return locked(userId, revision, async (connection, user, row) => {
        if (!(await consume(connection, userId, row, code)))
          throw new TwoFactorError(
            'Código inválido ou já utilizado. Use um novo código do aplicativo ou um código de recuperação.',
          );
        let codes: string[] = [];
        if (action === 'disable') {
          await connection.execute(
            'DELETE FROM user_two_factor WHERE user_id = :userId',
            { userId },
          );
        } else {
          const recovery = recoveryCodes(userId);
          codes = recovery.codes;
          await connection.execute(
            'UPDATE user_two_factor SET recovery_hashes = :hashes WHERE user_id = :userId',
            { userId, hashes: JSON.stringify(recovery.hashes) },
          );
        }
        return {
          recoveryCodes: codes,
          revision: await bumpRevision(connection, user),
        };
      });
    },
  };
}

export type TwoFactorService = ReturnType<typeof createTwoFactorService>;
