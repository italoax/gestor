import net from 'node:net';
import tls from 'node:tls';

export interface ProbeOptions {
  host: string;
  port?: number;
  timeoutMs?: number;
  ca?: string;
}

export interface ProbeResult {
  host: string;
  port: number;
  phase: 'tcp' | 'greeting' | 'tls';
  tlsAdvertised: boolean;
  serverVerified: boolean;
  credentialsSent: false;
  sqlSent: false;
  errorCode?: string;
  protocol?: string;
  cipher?: string;
  certificate?: {
    subjectAlternativeNames?: string;
    validFrom?: string;
    validTo?: string;
    fingerprint256?: string;
  };
}

// Protocol::SSLRequest ends BEFORE the username field. No mysql client/pool,
// dotenv, application config, authentication response or SQL is used here.
// https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_basic_tls.html
export function probeMysqlTls(options: ProbeOptions): Promise<ProbeResult> {
  const { host, port = 3306, timeoutMs = 8000, ca } = options;
  if (!/^[a-zA-Z0-9.-]+$/.test(host) || net.isIP(host))
    throw new Error('Informe um hostname DNS, sem URL ou credenciais.');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Porta invalida.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('Timeout invalido.');
  return new Promise((resolve) => {
    const result: ProbeResult = {
      host,
      port,
      phase: 'tcp',
      tlsAdvertised: false,
      serverVerified: false,
      credentialsSent: false,
      sqlSent: false,
    };
    let secured: tls.TLSSocket | undefined;
    let done = false;
    let received = Buffer.alloc(0);
    const socket = net.createConnection({ host, port });
    const finish = (code?: string) => {
      if (done) return;
      done = true;
      if (code) result.errorCode = code;
      clearTimeout(deadline);
      secured?.destroy();
      socket.destroy();
      resolve(result);
    };
    const deadline = setTimeout(() => finish('PROBE_TIMEOUT'), timeoutMs);
    const failure = (error: NodeJS.ErrnoException) => {
      const code = error.code;
      finish(
        code && /^[A-Z0-9_]{1,100}$/.test(code) ? code : 'CONNECTION_FAILED',
      );
    };
    socket.on('error', failure);
    socket.on('connect', () => {
      result.phase = 'greeting';
    });
    socket.on('close', () => {
      if (!secured) finish('CONNECTION_CLOSED');
    });
    socket.on('data', function greeting(chunk: Buffer) {
      received = Buffer.concat([received, chunk]);
      if (received.length > 4096) return finish('GREETING_TOO_LARGE');
      if (received.length < 4) return;
      const size = received.readUIntLE(0, 3);
      if (size > 4092 || received[3] !== 0) return finish('INVALID_GREETING');
      if (received.length < size + 4) return;
      if (received.length !== size + 4) return finish('INVALID_GREETING');
      const payload = received.subarray(4);
      const versionEnd = payload.indexOf(0, 1);
      // protocol, version\0, connection id, scramble[8], filler, capabilities.
      const capabilityOffset = versionEnd + 14;
      if (
        payload[0] !== 10 ||
        versionEnd < 2 ||
        payload.length < capabilityOffset + 2
      )
        return finish('INVALID_GREETING');
      const flags = payload.readUInt16LE(capabilityOffset);
      if (!(flags & 0x0800)) return finish('TLS_NOT_ADVERTISED');
      result.tlsAdvertised = true;
      if (!(flags & 0x0200)) return finish('PROTOCOL_41_REQUIRED');
      socket.removeListener('data', greeting);
      const request = Buffer.alloc(36);
      request.writeUIntLE(32, 0, 3);
      request[3] = 1;
      request.writeUInt32LE(0x0200 | 0x0800, 4); // PROTOCOL_41 | SSL
      request[12] = 45; // utf8mb4_general_ci; remainder is zero filler.
      result.phase = 'tls';
      socket.write(request);
      secured = tls.connect({
        socket,
        servername: host,
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        ...(ca ? { ca } : {}),
      });
      secured.on('error', failure);
      secured.on('close', () => finish('CONNECTION_CLOSED'));
      secured.once('secureConnect', () => {
        if (!secured?.authorized) return finish('CERTIFICATE_NOT_AUTHORIZED');
        const cert = secured.getPeerCertificate();
        result.serverVerified = true;
        result.protocol = secured.getProtocol() || undefined;
        result.cipher = secured.getCipher()?.name;
        result.certificate = {
          subjectAlternativeNames: cert.subjectaltname?.slice(0, 2048),
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          fingerprint256: cert.fingerprint256,
        };
        // Deliberately do NOT send HandshakeResponse, even an empty username.
        finish();
      });
    });
  });
}
