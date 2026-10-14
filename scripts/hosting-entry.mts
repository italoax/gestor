// O LiteSpeed usa require() nesta entrada. O import dinâmico mantém o módulo
// síncrono para o carregador, mesmo quando a inicialização usa top-level await.
export function hostingEntrySource(): string {
  return `export const startup = import('./runtime/scripts/run-stack.mjs').catch((error) => {
  console.error('Erro ao iniciar o Gestor:', error);
  process.exitCode = 1;
});
`;
}
