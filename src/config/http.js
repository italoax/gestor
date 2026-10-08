import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import expressLayouts from 'express-ejs-layouts';

export function configureHttp(app, root, env) {
  // Hostinger/Cloudflare terminam o HTTPS antes do Node.
  // Sem trust proxy, o express-session não envia cookie `secure` em produção,
  // então o login redireciona para /dashboard mas a sessão não fica salva.
  app.set('trust proxy', 1);
  app.set('view engine', 'ejs');
  app.set('views', path.join(root, 'src/views'));
  app.set('layout', 'layouts/main');
  app.use(expressLayouts);
  // CSP pragmática: permite scripts/estilos inline (o projeto usa `style=` e algumas
  // chamadas inline) mas bloqueia scripts de domínios desconhecidos. Reduz superfície
  // de XSS (atacante não consegue carregar JS de evil.com) sem quebrar o painel atual.
  // Em dev fica desligada pra não atrapalhar hot-reload.
  app.use(
    helmet({
      contentSecurityPolicy:
        env.nodeEnv === 'production'
          ? {
              useDefaults: true,
              directives: {
                defaultSrc: ["'self'"],
                scriptSrc: [
                  "'self'",
                  "'unsafe-inline'",
                  'https://cdn.jsdelivr.net',
                ],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", 'data:'],
                frameAncestors: ["'self'"],
                formAction: ["'self'"],
              },
            }
          : false,
    }),
  );
  // Comprime respostas com gzip — HTML/CSS/JS encolhem ~70%. Especialmente
  // importante em hospedagem compartilhada com largura de banda limitada.
  app.use(compression());
  // URLs de acesso e pagamento contêm credenciais; registre somente metadados.
  app.use(morgan(':method :status :response-time ms'));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
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
