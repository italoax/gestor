import { request } from 'node:https';

// Used only with the fixed bank URLs in bankPix.ts. No redirects or disabled TLS checks.
export function mtlsJson(
  url: string,
  credentials,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<any> {
  return new Promise((resolve, reject) => {
    const certificate = String(credentials.certificate_pem || '').replace(
      /\\n/g,
      '\n',
    );
    const key = String(
      credentials.private_key_pem || credentials.certificate_pem || '',
    ).replace(/\\n/g, '\n');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let req: ReturnType<typeof request>;
    try {
      req = request(
        url,
        {
          method: init.method || 'GET',
          headers: init.headers,
          cert: certificate,
          key,
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          signal: controller.signal,
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk) => {
            size += chunk.length;
            if (size > 2 * 1024 * 1024) {
              response.destroy(new Error('Resposta do banco excede o limite.'));
              return;
            }
            chunks.push(Buffer.from(chunk));
          });
          response.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          response.on('end', () => {
            clearTimeout(timeout);
            if (
              !response.statusCode ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              reject(
                new Error(
                  `Não foi possível acessar o banco (HTTP ${response.statusCode}).`,
                ),
              );
              return;
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              reject(new Error('O banco retornou uma resposta inválida.'));
            }
          });
        },
      );
      req.on('error', () => {
        clearTimeout(timeout);
        reject(
          new Error('Não foi possível autenticar com o certificado do banco.'),
        );
      });
      req.end(init.body);
    } catch {
      clearTimeout(timeout);
      reject(new Error('Certificado ou chave privada inválidos.'));
    }
  });
}
