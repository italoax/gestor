# Gestor IXTV — Node.js

Painel web para gerenciar clientes e assinaturas IPTV, acompanhar vencimentos, registrar pagamentos e organizar o atendimento pelo WhatsApp.

O projeto reúne o controle comercial em uma interface responsiva para desktop e celular. Desenvolvido com Node.js e TypeScript, utiliza páginas renderizadas no servidor e navegação interna sem recarregar todo o painel.

## Funcionalidades

- **Dashboard:** clientes ativos, vencimentos, receita, custo e lucro.
- **Clientes e catálogo:** cadastro de clientes, planos, servidores, telas, dispositivos e aplicativos.
- **Controle de créditos:** consumo conforme plano, quantidade de telas e ciclos de renovação.
- **Área do cliente:** consulta da assinatura por credenciais ou link individual, com escolha da duração da renovação.
- **Pagamentos PIX:** geração de cobranças e confirmação por webhook dos provedores.
- **Renovações pendentes:** avisos de pagamento para o responsável renovar o acesso externo e confirmar a atualização no Gestor.
- **WhatsApp:** conexão por QR Code através de uma API separada, modelos de mensagem e regras de cobrança.
- **Status agendados:** texto, imagem ou vídeo, legendas em múltiplas linhas e histórico atualizado automaticamente.
- **Notificações:** avisos no painel e notificações push quando configuradas.
- **Interface responsiva:** temas claro e escuro, modais acessíveis e controles adaptados ao celular.

### Como funciona a renovação

1. O cliente abre seu link e escolhe a duração da renovação.
2. O provedor confirma o pagamento PIX.
3. O Gestor apresenta a renovação pendente ao responsável.
4. O responsável renova o acesso no painel externo e marca o cliente como renovado no Gestor.
5. O Gestor atualiza o vencimento, desconta os créditos e registra a transação.

A aprovação do PIX, por si só, não realiza a renovação no painel externo.

## Tecnologias

| Camada | Tecnologias |
| --- | --- |
| Backend | Node.js, TypeScript e Express |
| Páginas | EJS, HTML e CSS |
| Interatividade | JavaScript e navegação PJAX |
| Banco de dados | MySQL/MariaDB |
| Autenticação | Sessões persistidas no MySQL e bcrypt |
| Integrações | APIs de pagamento, webhooks, Web Push e API WhatsApp |
| Testes | Node Test Runner e Chrome |

## Organização

```text
src/
  config/       Configuração da aplicação
  db/           Conexão e estrutura do banco
  middleware/   Autenticação e proteção de requisições
  routes/       Rotas do painel e da área do cliente
  services/     Regras de negócio e integrações
  shared/       Utilitários compartilhados
  views/        Páginas e componentes EJS
public/         Estilos, scripts, imagens e ícones
scripts/        Desenvolvimento, limpeza e empacotamento
test/           Testes automatizados
```

Este repositório contém o **painel Node.js**. O serviço que mantém as sessões do WhatsApp é executado separadamente.

## Executar localmente

Requer Node.js, npm e um banco MySQL/MariaDB acessível. Os comandos abaixo usam PowerShell no Windows.

Instale as dependências, incluindo as ferramentas de desenvolvimento:

```powershell
npm.cmd install --include=dev
```

Crie o arquivo `.env` na raiz e configure:

| Variável | Finalidade |
| --- | --- |
| `DB_HOST`, `DB_PORT` | Endereço e porta do banco |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | Banco e credenciais |
| `SESSION_SECRET` | Segredo da sessão, com pelo menos 32 caracteres aleatórios |
| `WA_DRIVER` | Use `session` para a API WhatsApp por sessão |
| `WA_SESSION_API_URL`, `WA_SESSION_API_TOKEN` | Endereço e autenticação da API WhatsApp |
| `VAPID_PUBLIC`, `VAPID_PRIVATE`, `VAPID_SUBJECT` | Configuração opcional de notificações push |

O arquivo `schema-hostinger.sql` contém a estrutura inicial do banco. As credenciais dos provedores PIX são configuradas no painel, em **Integração de Pagamento**.

Para desenvolvimento com recompilação do backend:

```powershell
npm.cmd run dev
```

Para compilar e executar localmente:

```powershell
npm.cmd run start:local
```

O iniciador local usa `http://localhost`, na porta 80 por padrão. Ele mantém as rotinas de cobrança e agendamento habilitadas; para demonstrações, utilize dados e serviços de teste.

## Testes e compilação

```powershell
npm.cmd test
npm.cmd run test:browser
npm.cmd run build
```

Os testes cobrem acesso do cliente, isolamento entre contas, pagamentos, renovação, consumo de créditos e navegação. O teste de navegador usa Google Chrome instalado.

`dist/` é gerado pela compilação e não deve ser editado. `npm.cmd run clean` remove somente essa pasta.

## Publicação

Para gerar o ZIP do painel para a hospedagem:

```powershell
npm.cmd run deploy
```

O script compila o projeto e atualiza as versões de cache dos arquivos estáticos. Na hospedagem, o ponto de entrada é `dist/server.js`; configure as variáveis de ambiente e reinicie o aplicativo após publicar o pacote.

O `.env`, as dependências instaladas, os backups e os ZIPs gerados ficam fora do Git. A API WhatsApp possui publicação e configuração próprias.

## Autor

Desenvolvido por [Italo](https://github.com/italoax).
