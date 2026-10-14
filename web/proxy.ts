import { NextResponse } from 'next/server';
import {
  isSitePage,
  isUnknownPageNavigation,
} from '../src/frontend/pageRoutes.ts';

export function proxy(request) {
  if (
    isUnknownPageNavigation(
      request.nextUrl.pathname,
      request.method,
      request.headers.get('accept') || '',
    )
  )
    return NextResponse.redirect(new URL('/', request.url));
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
    headers.delete('x-gestor-page');
    headers.delete('x-gestor-page-url');
    headers.set(
      'x-forwarded-proto',
      request.headers.get('x-forwarded-proto') ||
        request.nextUrl.protocol.slice(0, -1),
    );
    return NextResponse.rewrite(destination, { request: { headers } });
  }
  const headers = new Headers(request.headers);
  headers.delete('x-gestor-page');
  headers.set(
    'x-gestor-page-url',
    request.nextUrl.pathname + request.nextUrl.search,
  );
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Cache-Control', 'private, no-store');
  if (request.nextUrl.pathname !== '/')
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  if (/^\/(area-cliente|pagar|p)(\/|$)/.test(request.nextUrl.pathname))
    response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}
export const config = { matcher: ['/((?!_next/).*)'] };
