f6f4ffbd-632a-4617-a8db-6fced00ba10c# Revisão visual — 07/10/2026

Revisão local das páginas EJS no Chrome, com dados fictícios, seguida de ajustes de desktop e celular. As alterações ainda precisam ser publicadas.

## Correções e melhorias

- Elementos com `hidden` agora permanecem ocultos mesmo quando classes de botão ou formulário definem `display`. Isso evita controles de notificação e campos condicionais aparecendo fora do momento correto.
- Gráficos respeitam a largura disponível, inclusive em telas de 320 pixels; o tamanho intrínseco do canvas não amplia mais o grid.
- Conta e configurações de pagamento usam duas colunas no desktop, com cartões e campos alinhados. No celular, voltam para uma coluna.
- Formulário de automação organiza as opções de envio em duas colunas no desktop, mantendo o formulário contínuo solicitado.
- Administração de usuários e backups apresenta linhas como cartões com rótulos no celular. Botões de assinatura e backup cabem dentro do cartão.
- Ícones dos provedores de pagamento são SVGs locais, sem dependência de favicons externos.
- Conteúdo do painel aparece imediatamente, sem esperar animações de revelação. A página pública conserva seus efeitos.
- Tipografia, foco de teclado, espaçamentos, números, ações dos cards e botões em telas pequenas seguem regras compartilhadas.
- As tabelas extensas conservam a rolagem interna para manter as informações acessíveis.

## Cobertura

27 páginas: dashboard, clientes, servidores, planos, aplicativos, dispositivos, mensagens, automação, transações, WhatsApp, status, integrações, pagamento, conta, acessos dos clientes, login, cadastro, assinatura, três páginas administrativas, portal do cliente, página PIX, página pública e páginas auxiliares de erro/indisponibilidade.

A auditoria verifica limites de conteúdo e controles, abre os modais e percorre suas abas. Usa larguras de 1440, 1024, 768, 390 e 320 pixels no tema escuro; o tema claro é conferido em 1440 e 390 pixels. Brilhos decorativos e recortes intencionais do logotipo não são classificados como controles fora da tela.

## Reprodução local

- `node test/ui-audit.browser.mjs`: auditoria visual; salva capturas e `findings.json` em `.tmp-ui/audit-before` por padrão. `UI_PHASE` permite nomear a execução, `UI_THEME=light` seleciona o tema claro e `UI_PAGES` permite limitar as páginas.
- `npm.cmd run test:browser`: regressões de navegação, menus, formulários, renovação e PIX.
- `npm.cmd run build` e `npm.cmd test`: compilação e testes funcionais.

O script visual usa Chrome instalado no caminho configurado pelo teste e não envia mensagens nem realiza pagamentos reais. A pasta `test` e as capturas são locais, conforme o `.gitignore` existente.

## Resultado da validação

- Auditoria de 27 páginas nas cinco larguras do tema escuro e nas duas larguras do tema claro: nenhum transbordamento inesperado detectado pelos critérios do script.
- Checagem adicional incluindo campos de formulário e diálogos nativos nas cinco larguras: aprovada.
- Compilação aprovada, 106 testes funcionais aprovados e regressões de navegação no navegador aprovadas.
- Capturas de desktop e celular revisadas para conferir alinhamento, hierarquia e legibilidade, além das verificações automáticas.

## Limites de cobertura

Verificação com dados fictícios no Chrome, incluindo emulação de celular. Não substitui uma revisão com os dados de produção nem testes em aparelhos físicos com Safari/iOS e outros navegadores. Não é uma garantia de ausência de qualquer falha visual em todos os ambientes.
