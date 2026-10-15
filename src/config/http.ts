import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import expressLayouts from 'express-ejs-layouts';
import { trustedProxyAddresses } from '../security/proxyTrust.ts';
import { randomBytes } from 'node:crypto';
import { contentSecurityPolicy } from '../security/contentSecurityPolicy.ts';

export function configureHttp(app, root, env) {
  app.locals.nextFrontendEnabled = env.nextFrontendEnabled;
  // Hostinger/Cloudflare terminam o HTTPS antes do Node.
  // Sem trust proxy, o express-session não envia cookie `secure` em produção,
  // então o login redireciona para /dashboard mas a sessão não fica salva.
  const trustedProxies = trustedProxyAddresses(
    env.trustedProxyCidrs || 'loopback',
  );
  // Socket Unix/named pipe é transporte local explícito, sem remoteAddress TCP.
  app.set('trust proxy', (address) =>
    address ? trustedProxies(address) : Boolean(process.env.BACKEND_SOCKET),
  );
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'src/views'));
  app.set('layout', 'layouts/main');
  app.use(expressLayouts);
  app.use((_req, res, next) => {
    res.locals.cspNonce = randomBytes(18).toString('base64');
    if (env.nodeEnv === 'production')
      res.setHeader(
        'Content-Security-Policy',
        contentSecurityPolicy(res.locals.cspNonce),
      );
    next();
  });
  // A CSP com nonce foi aplicada acima. Helmet mantém os demais cabeçalhos;
  // estilos inline continuam permitidos por compatibilidade com o painel.
  app.use(
    helmet({
      strictTransportSecurity:
        env.nodeEnv === 'production'
          ? { maxAge: 31536000, includeSubDomains: false }
          : false,
      contentSecurityPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  // Comprime respostas com gzip — HTML/CSS/JS encolhem ~70%. Especialmente
  // importante em hospedagem compartilhada com largura de banda limitada.
  app.use(compression());
  // URLs de acesso e pagamento contêm credenciais; registre somente metadados.
  app.use(
    morgan('[HTTP] :method :status :response-time ms', {
      skip: (req, res) =>
        process.env.LOG_VERBOSE !== 'true' &&
        ['GET', 'HEAD'].includes(req.method) &&
        res.statusCode < 400,
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(
    express.json({
      verify: (req, _res, buffer) => {
        if (/^\/webhook\//.test(req.url || ''))
          (req as any).rawBody = Buffer.from(buffer);
      },
    }),
  );
  // Apenas a pagina comercial deve aparecer nos resultados de busca.
  app.use((req, res, next) => {
    if (
      !['/', '/ix-streaming', '/robots.txt', '/sitemap.xml'].includes(
        req.path,
      ) &&
      !req.path.startsWith('/assets/') &&
      !req.path.startsWith('/icons/')
    ) {
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    }
    next();
  });
}
