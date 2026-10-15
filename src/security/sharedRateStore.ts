import { createHash } from 'node:crypto';
// Cada contador tem expiração própria; uma rajada não aumenta indefinidamente o bloqueio.
export class SharedRateStore {
  windowMs = 60_000;
  localKeys = false;
  private nextCleanup = 0;
  constructor(
    private db,
    private bucket: string,
    private now = Date.now,
  ) {}
  init(options) {
    this.windowMs = options.windowMs;
  }
  private key(key: string) {
    return createHash('sha256').update(`${this.bucket}:${key}`).digest('hex');
  }
  async increment(key: string) {
    const time = this.now(),
      keyHash = this.key(key);
    if (time >= this.nextCleanup) {
      this.nextCleanup = time + 60_000;
      await this.db.execute(
        'DELETE FROM security_rate_limits WHERE reset_at < :expired LIMIT 1000',
        { expired: time - 86400_000 },
      );
    }
    await this.db.execute(
      `INSERT INTO security_rate_limits (bucket, key_hash, hits, reset_at) VALUES (:bucket, :keyHash, 1, :resetAt)
      ON DUPLICATE KEY UPDATE hits = IF(reset_at <= :time, 1, LEAST(hits + 1, 1000000)), reset_at = IF(reset_at <= :time, :resetAt, reset_at)`,
      {
        bucket: this.bucket,
        keyHash,
        time,
        resetAt: time + this.windowMs,
      },
    );
    const row = await this.db.queryOne(
      'SELECT hits, reset_at AS resetAt FROM security_rate_limits WHERE bucket = :bucket AND key_hash = :keyHash',
      { bucket: this.bucket, keyHash },
    );
    if (!row) throw new Error('Contador de segurança indisponível.');
    return {
      totalHits: Number(row.hits),
      resetTime: new Date(Number(row.resetAt)),
    };
  }
  async decrement(key: string) {
    await this.db.execute(
      'UPDATE security_rate_limits SET hits = GREATEST(hits, 1) - 1 WHERE bucket = :bucket AND key_hash = :keyHash',
      { bucket: this.bucket, keyHash: this.key(key) },
    );
  }
  async resetKey(key: string) {
    await this.db.execute(
      'DELETE FROM security_rate_limits WHERE bucket = :bucket AND key_hash = :keyHash',
      { bucket: this.bucket, keyHash: this.key(key) },
    );
  }
}
