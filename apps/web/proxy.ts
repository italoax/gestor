import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { noStoreHeaders } from '../../src/config/cache.ts';
import { contentSecurityPolicy } from '../../src/security/contentSecurityPolicy.ts';
import { verifiedOrigin } from '../../src/security/proxyTrust.ts';
import {
  isSitePage,
  isUnknownPageNavigation,
} from '../../src/frontend/pageRoutes.ts';

export function proxy(request) {
  const origin = verifiedOrigin(request.headers, process.env.SESSION_SECRET);
  const nonce = randomBytes(18).toString('base64');
  const csp = contentSecurityPolicy(
    nonce,
    process.env.NODE_ENV !== 'production',
  );
  if (
    isUnknownPageNavigation(
      request.nextUrl.pathname,
      request.method,
      request.headers.get('accept') || '',
    )
  )
    return NextResponse.redirect(new URL('/', request.url), {
      headers: noStoreHeaders,
    });
  // Os formulários continuam sendo validados e gravados pelo Express.
  if (
    !isSitePage(request.nextUrl.pathname) ||
    request.headers.get('accept')?.includes('application/json') ||
    (request.nextUrl.pathname === '/login' &&
      request.nextUrl.searchParams.has('session_check')) ||
    (request.nextUrl.pathname === '/area-cliente/login' &&
      request.nextUrl.searchParams.has('acesso')) ||
    !['GET', 'HEAD'].includes(request.method)
  ) {
    const destination = new URL(
      process.env.NEXT_BACKEND_URL || 'http://127.0.0.1:3001',
    );
    destination.pathname = request.nextUrl.pathname;
    destination.search = request.nextUrl.search;
    const headers = new Headers(request.headers);
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-proto');
    if (origin) {
      headers.set('x-forwarded-for', origin.ip);
      headers.set('x-forwarded-proto', origin.protocol);
    }
    headers.delete('x-gestor-origin-signature');
    headers.delete('x-gestor-page');
    headers.delete('x-gestor-page-url');
    headers.set(
      'x-forwarded-proto',
      origin?.protocol ||
        new URL(process.env.APP_URL || request.url).protocol.slice(0, -1),
    );
    return NextResponse.rewrite(destination, {
      request: { headers },
      headers: noStoreHeaders,
    });
  }
  const headers = new Headers(request.headers);
  headers.delete('x-forwarded-for');
  if (origin) headers.set('x-forwarded-for', origin.ip);
  headers.set(
    'x-forwarded-proto',
    origin?.protocol ||
      new URL(process.env.APP_URL || request.url).protocol.slice(0, -1),
  );
  headers.delete('x-gestor-origin-signature');
  headers.set('x-nonce', nonce);
  headers.set('Content-Security-Policy', csp);
  headers.delete('x-gestor-page');
  headers.set(
    'x-gestor-page-url',
    request.nextUrl.pathname + request.nextUrl.search,
  );
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', csp);
  for (const [key, value] of Object.entries(noStoreHeaders))
    response.headers.set(key, value);
  if (request.nextUrl.pathname !== '/')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (/^\/(area-cliente|pagar|p)(\/|$)/.test(request.nextUrl.pathname))
    response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: ['/((?!_next/).*)'] };
