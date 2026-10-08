# Gestor IXTV

Na hospedagem, a entrada principal é `src/server.js`. Para configurações antigas que usam `dist/server.js`, `npm run build` cria um arquivo de compatibilidade que inicia o mesmo servidor, sem compilar TypeScript nem duplicar o código.

**Versão atual: 0.1.0**

O mapa das pastas, as responsabilidades de cada módulo e os comandos de manutenção estão em [Organização do código](docs/CODIGO.md). Use `npm run format` para organizar os arquivos, `npm run format:check` para conferir o padrão e `npm run check` para verificar JavaScript e templates EJS.

Os arquivos estáticos usam versões automáticas pelo conteúdo (SHA-256). Os templates chamam `assetUrl('/assets/js/navigation.js')`, sem números manuais. O build gera `dist/assets-manifest.json` e `dist/sw.js` para conferência; o servidor calcula as mesmas versões ao iniciar e serve `/sw.js` e `/manifest.json` com URLs sincronizadas. Alterar um arquivo muda sua URL e o cache do service worker automaticamente no próximo deploy/reinício. Em desenvolvimento, as versões são recalculadas ao carregar a página, sem precisar reiniciar. Os artefatos em `dist/` não precisam ser enviados ao GitHub.

## Últimas atualizações — 07/10/2026

- Visual do painel revisado para desktop e celular, com ajustes em cards, formulários, modais e botões.
- Dashboard com resumo de clientes, acessos principais e adicionais e situação dos acessos por servidor.
- Status publicados no WhatsApp removidos automaticamente do painel após 24 horas.
- Automação com formulário contínuo e avisos considerando os dois acessos do cliente.
- Renovação pelo link do cliente com opção de selecionar um servidor ou renovar ambos.
- Melhorias de segurança no login, na conta e no portal do cliente.
