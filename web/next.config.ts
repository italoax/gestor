import { fileURLToPath } from 'node:url';
export default {
  poweredByHeader: false,
  // A hospedagem compartilha CPUs; evite criar 27 processos de compilação.
  experimental: { cpus: 2 },
  turbopack: { root: fileURLToPath(new URL('../', import.meta.url)) },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          ...(process.env.NODE_ENV === 'production'
            ? [
                {
                  key: 'Content-Security-Policy',
                  value:
                    "default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://cloudflareinsights.com; font-src 'self' data:; frame-ancestors 'self'; form-action 'self'",
                },
              ]
            : []),
        ],
      },
    ];
  },
};
