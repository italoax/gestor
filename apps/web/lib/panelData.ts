// A estrutura compartilhada precisa apenas dos dados do cabeçalho e da sessão.
// Listas e demais dados de cada tela permanecem no conteúdo da própria rota.
export function panelShellData(
  data: any,
  currentPath = data.currentPath || '/clientes',
) {
  return {
    currentPath,
    title: data.title,
    user: { id: data.user.id, name: data.user.name },
    page: {
      csrfToken: data.page.csrfToken,
      releaseNoticeLoginId: data.page.releaseNoticeLoginId,
      sessionExpiresAt: data.page.sessionExpiresAt,
    },
  };
}
