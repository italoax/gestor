# Organização do código

## Backend

| Local                     | Responsabilidade                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/server.js`           | Iniciar HTTP, preparar o banco, iniciar automações e encerrar o processo.                         |
| `src/app.js`              | Montar o Express e definir a ordem dos middlewares e rotas.                                       |
| `src/config/`             | Ambiente, caminhos do projeto e configuração HTTP.                                                |
| `src/middleware/`         | Autenticação, sessões, CSRF, assets, dados dos templates e tratamento de erros.                   |
| `src/routes/index.js`     | Registrar rotas públicas antes do bloqueio de autenticação e depois registrar as rotas do painel. |
| `src/routes/system.js`    | Health check e endpoint de execução das automações.                                               |
| `src/routes/`             | Validar requisições e responder com HTML ou JSON por funcionalidade.                              |
| `src/services/`           | Regras de negócio, integrações e tarefas agendadas.                                               |
| `src/services/providers/` | Implementações dos provedores de pagamento.                                                       |
| `src/db/`                 | Conexões, sessões persistidas e migrações do banco.                                               |
| `src/shared/`             | Funções pequenas compartilhadas.                                                                  |

A ordem em `src/app.js` preserva três regras: assets e health check não precisam de sessão; os dados do usuário ficam disponíveis antes de uma rejeição de CSRF renderizar uma página; pagamentos e área do cliente têm rotas públicas antes das rotas protegidas do painel.

Importar `src/app.js` não inicia o servidor nem as automações. A entrada do deploy continua sendo `src/server.js`; `dist/server.js` permanece compatível com hospedagens antigas.

## Frontend

| Local                            | Responsabilidade                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `src/views/layouts/`             | Estrutura compartilhada das páginas.                                                  |
| `src/views/pages/`               | Conteúdo de cada tela.                                                                |
| `src/views/partials/`            | Componentes EJS reutilizáveis e lista de scripts do painel.                           |
| `public/assets/js/main.js`       | Inicialização da página, listeners compartilhados e coordenação dos componentes.      |
| `public/assets/js/ui/`           | Modais, tabelas e campos de telefone e data.                                          |
| `public/assets/js/pages/`        | Comportamentos de clientes, pagamentos, catálogos, transações, mensagens e automação. |
| `public/assets/js/app-shell.js`  | Funcionalidades persistentes do painel, notificações e WhatsApp.                      |
| `public/assets/js/navigation.js` | Navegação interna, troca de conteúdo e recuperação de falhas.                         |
| `public/assets/css/`             | Estilos compartilhados e específicos das telas.                                       |
| `public/sw.js`                   | Cache dos arquivos estáticos, página offline e notificações push.                     |

Os módulos de página registram inicializadores em `window.gestorPageModules`. A lista em `src/views/partials/app-scripts.ejs` carrega esses arquivos antes de `main.js`. O código executa na carga inicial e após cada navegação interna, sem recarregar os módulos.

Cada inicializador recebe suas dependências em um objeto. Listeners globais usam o helper `on` para serem cancelados quando a página é trocada. Os listeners de elementos dentro do conteúdo da página desaparecem com os elementos antigos. Use os helpers compartilhados de modais, datas e telefone em novas telas.

Todos os arquivos locais referenciados pelos templates usam `assetUrl('/caminho/do/arquivo')`. O hash do conteúdo é calculado automaticamente e compartilhado pelo HTML, pelo manifesto PWA e pelo service worker. Ao adicionar um módulo, registre seu script no partial; não acrescente versões numéricas.

## Padrões e verificações

- JavaScript do servidor usa módulos ES e indentação de dois espaços.
- JavaScript do navegador mantém os scripts existentes e separa componentes por responsabilidade.
- Prettier organiza JavaScript, CSS, JSON, HTML e Markdown. O adaptador dos templates preserva os blocos EJS e o JavaScript embutido enquanto formata o HTML.
- `.editorconfig`, `.prettierrc.json` e `.gitattributes` mantêm UTF-8, indentação e finais de linha consistentes entre Windows e o deploy.
- Credenciais, uploads, sessões, backups, dependências e arquivos gerados ficam fora da formatação.

| Comando                | Uso                                                                             |
| ---------------------- | ------------------------------------------------------------------------------- |
| `npm run format`       | Aplicar a formatação em todos os arquivos de código e documentação.             |
| `npm run format:check` | Conferir a formatação sem editar arquivos.                                      |
| `npm run check`        | Verificar a sintaxe JavaScript e compilar os templates EJS.                     |
| `npm run build`        | Executar as verificações e gerar a entrada do servidor e as versões dos assets. |
| `npm test`             | Executar os testes disponíveis na pasta local `test/`.                          |
| `npm run test:browser` | Verificar navegação, modais e operações nas páginas reais usando Chrome.        |

O diretório `test/` continua com a regra existente do `.gitignore`: seus testes são mantidos neste computador. A formatação e o build funcionam no checkout do GitHub sem esse diretório.
