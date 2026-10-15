// O LiteSpeed usa require() nesta entrada. O import dinâmico mantém o módulo
// síncrono para o carregador, mesmo quando a inicialização usa top-level await.
export function hostingEntrySource(): string {
  return `import dotenv from 'dotenv';
import { openPublicServer } from './runtime/src/frontend/publicServer.js';
const configuration = dotenv.config({ quiet: true, path: process.env.GESTOR_ENV_FILE || '.env' });
if (process.env.GESTOR_ENV_FILE && configuration.error) throw new Error('Não foi possível carregar a configuração explícita do ambiente.');
export const listener = openPublicServer(Number(process.env.FRONTEND_PORT || process.env.PORT || 3000), process.env.FRONTEND_HOST || '0.0.0.0');
export const startup = import('./runtime/scripts/run-stack.mjs').then(({ runStack }) => runStack(listener)).catch(async (error) => {
  console.error('Erro ao iniciar o Gestor:', error);
  process.exitCode = 1;
  await listener.close();
});
`;
}
