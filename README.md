# ixstreaming — site e painel Gestor

## Padrão visual

O painel usa [panel-ui.css](packages/gestor/public/assets/css/panel-ui.css) para manter o padrão da tela de dispositivos: 24 px entre seções, 16 px entre cartões, controles alinhados e ações secundárias discretas. No celular, os espaços se ajustam e as ações dos catálogos mantêm uma área de toque de pelo menos 44 px de altura.

Ao criar ou ajustar telas, reutilize `ui-summary` com `ui-summary-2` até `ui-summary-5`, `ui-toolbar`, `ui-catalog` e `ui-catalog-heading`. Use o componente [ui-icon.ejs](packages/gestor/src/views/partials/ui-icon.ejs) para ícones, passando `name`. Mantenha cores nos tokens de tema e acrescente regras compartilhadas em `panel-ui.css`, evitando novas sobrescritas de catálogo em `node-migration.css`. Preserve tabelas, gráficos e formulários conforme a função de cada tela.

Os efeitos do painel e da landing page ficam em [visual-effects.css](packages/gestor/public/assets/css/visual-effects.css) e [visual-effects.js](packages/gestor/public/assets/js/visual-effects.js): luzes de fundo, entradas ao rolar, brilho nos cartões e respostas dos controles. O botão de pausa no canto inferior guarda a preferência neste navegador. A preferência de movimento reduzido do dispositivo tem prioridade. A navegação interna do painel inicializa os efeitos nos novos cartões, e o conteúdo permanece visível se o JavaScript estiver desativado.

## Área do cliente

### Configurar recebimento por QR Code PIX

No painel, abra **Integração de Pagamento**. Configure e ative sua conta em um dos provedores disponíveis e selecione-a em **Receber PIX por**. Salve a conta de recebimento. A configuração exibe a URL completa do webhook que deve ser usada no provedor; em produção, `APP_URL` deve conter o domínio público HTTPS do site.

Envie a variável `{link_cliente}` nas mensagens para o cliente gerar QR Code e PIX Copia e Cola. Salvar as credenciais não realiza cobrança nem testa a conta junto ao provedor. O recebimento real exige credenciais válidas de produção.

As páginas **Meu plano** e **Admin**, a cobrança de assinatura do painel e o bloqueio por vencimento dessa assinatura foram desativados. O pagamento PIX dos clientes continua independente dessas funções.

### Mensagem após pagamento PIX

Em **Integração de Pagamento → Mensagem após confirmação do PIX**, escolha um modelo cadastrado em **Mensagens** e clique em **Salvar mensagem**. Para desligar, escolha **Não enviar mensagem**. A preferência fica salva na conta e vale em todos os dispositivos.

A confirmação usa o WhatsApp principal e só é disparada após a aprovação do provedor. Ela confirma o pagamento; configure o texto sem prometer que o acesso já foi renovado. A renovação no outro painel é feita manualmente pelo responsável.

O PIX aprovado aparece no sino e em **Clientes → Pagamentos recebidos — renovar no painel**, com nome, valor e duração. Depois de renovar o acesso no outro painel, clique em **Marcar como renovado**. Só então o gestor atualiza o vencimento, desconta os créditos e registra a transação. Pendências não são removidas por **Limpar tudo**. Confirmações repetidas não duplicam o débito. Push também é enviado quando as notificações do dispositivo estiverem ativadas.

O cliente entra em `/area-cliente` com o mesmo usuário e senha IPTV informados no cadastro. Não precisa criar senha separada. No painel, **Clientes → Acessos à área do cliente** permite habilitar ou desativar o acesso. Sem senha, o login manual fica indisponível, mas o link individual válido permite acessar a assinatura. Cadastros arquivados ou com acesso desativado não entram. Alterar as credenciais IPTV invalida as sessões anteriores. Se houver dois cadastros com o mesmo usuário e senha, o login será recusado para evitar acesso à conta errada; corrija os cadastros duplicados.

O cliente consulta usuário IPTV, plano, telas, aplicativo e vencimento. **Renovar com PIX** permite escolher a duração e gerar o pagamento da própria assinatura. Configure um provedor de pagamento no painel para habilitar o botão. Após o pagamento, o responsável recebe a pendência para renovar o acesso manualmente e confirmar no gestor.

As colunas de acesso são criadas automaticamente na inicialização do servidor atualizado. A compilação e os testes não alteram o banco de produção.

Guia para rodar o site no Windows e gerar o ZIP de atualização para a Hostinger.

## Comandos rápidos

Execute os comandos no PowerShell, na raiz do projeto:

```powershell
cd C:\Projetos\gestor-monorepo
```

| O que fazer | Comando |
| --- | --- |
| Instalar as dependências | `npm.cmd install` |
| Rodar localmente com reinício automático | `npm.cmd run dev:gestor` |
| Rodar localmente sem reinício automático | `npm.cmd run start:gestor` |
| Compilar o código | `npm.cmd run build:gestor` |
| Gerar o ZIP do site e painel | `npm.cmd run deploy:gestor` |

## Preparação

1. Tenha o Node.js instalado. O projeto foi utilizado com Node.js 24.
2. Abra o terminal na raiz do projeto e instale as dependências:

   ```powershell
   npm.cmd install
   ```

3. Configure o arquivo `packages/gestor/.env` com a conexão MySQL e as configurações do ambiente. Se ele já estiver configurado, mantenha os valores existentes.

As configurações de banco são `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` e `DB_PASSWORD`. O banco precisa existir e estar acessível; o servidor cria ou atualiza as tabelas ao iniciar. Configure também `SESSION_SECRET` com um segredo de pelo menos 32 caracteres, exigido ao executar em produção. As integrações, como a API do WhatsApp, dependem de suas próprias configurações.

O ambiente local usa o banco e as integrações configurados no `.env`; os scripts locais mantêm as rotinas de produção habilitadas (`LOCAL_MODE=false`).

### Se o PowerShell não reconhecer o npm

Confira a instalação:

```powershell
node --version
npm.cmd --version
```

Depois de instalar o Node.js, feche e abra novamente o VS Code. Se houver erro de execução do arquivo `npm.ps1`, use `npm.cmd`, como nos exemplos deste guia.

## Rodar o site localmente

```powershell
npm.cmd run dev:gestor
```

Quando o servidor iniciar, abra:

- **Página inicial:** <http://localhost>
- **Login do painel:** <http://localhost/login>

Deixe o terminal aberto. Para parar o servidor, pressione **Ctrl+C**.

O modo de desenvolvimento recompila e reinicia o servidor ao salvar mudanças em `src` ou `scripts`. Alterações em CSS, JavaScript público e imagens são vistas ao atualizar a página. O navegador não é atualizado automaticamente.

Depois de alterar o `.env`, pare e inicie o servidor novamente.

### Rodar sem reinício automático

```powershell
npm.cmd run start:gestor
```

Esse comando compila o projeto e inicia o servidor. Para aplicar alterações no código do servidor, pare com **Ctrl+C** e execute novamente.

### Se a porta 80 estiver ocupada

Escolha outra porta no terminal antes de iniciar:

```powershell
$env:PORT = "3000"
npm.cmd run dev:gestor
```

Nesse caso, acesse <http://localhost:3000> ou <http://localhost:3000/login>.

Para voltar à porta padrão, pare o servidor e execute:

```powershell
Remove-Item Env:PORT -ErrorAction SilentlyContinue
npm.cmd run dev:gestor
```

## Gerar o ZIP para a Hostinger

Na raiz do projeto, execute:

```powershell
npm.cmd run deploy:gestor
```

O comando compila o TypeScript, atualiza a versão dos arquivos estáticos do painel e gera um arquivo com nome como:

```text
packages/gestor/gestor1.176.zip
```

O número acima é um exemplo. A versão aumenta automaticamente a cada geração, e o terminal informa o nome e o caminho do ZIP criado.

**O script remove os ZIPs antigos que estão diretamente na pasta `packages/gestor`.** Se quiser guardar uma versão anterior, copie-a para outra pasta antes de executar.

O pacote inclui o site público, o painel, o código compilado, as telas e os arquivos públicos. Não inclui `.env` nem `node_modules`. A geração do ZIP não publica o site automaticamente.

### Usar o ZIP na Hostinger

1. Envie o ZIP gerado para a aplicação Node.js na Hostinger, pelo fluxo de atualização que você utiliza.
2. Mantenha as variáveis de ambiente configuradas na hospedagem.
3. Instale as dependências caso o processo de implantação não faça isso automaticamente.
4. Inicie ou reinicie a aplicação com `npm start` (entrada: `dist/server.js`).
5. Confira a página inicial no domínio e o painel em `/login`.

O ZIP do Gestor não atualiza o serviço separado da API do WhatsApp. As instruções desse serviço estão em [packages/whatsapp-api/README.md](packages/whatsapp-api/README.md).

## Se o terminal estiver em `packages/gestor`

Os comandos equivalentes são:

```powershell
npm.cmd run dev
npm.cmd run start:local
npm.cmd run build
npm.cmd run deploy
```

Execute apenas o comando correspondente à ação desejada; não é necessário rodar todos em sequência.

O link curto individual (`/r/...`), enviado por `{link_cliente}`, agora entra automaticamente na área do cliente, sem digitar credenciais. O cliente escolhe **Renovar com PIX**. Quem possuir o link pode acessar essa assinatura; envie apenas ao cliente correspondente. Contas arquivadas ou com acesso desativado não entram pelo link.

Para revogar um link: **Clientes → menu de três pontos → Acesso do cliente → Revogar link de acesso**. O link anterior e as sessões vinculadas deixam de funcionar. A próxima cópia ou envio gera um novo código de 16 caracteres.

No modo `npm.cmd run dev:gestor`, salvar templates ou arquivos de `public` não reinicia o servidor: recarregue o navegador. Alterações no backend são compiladas antes de reiniciar; se houver erro de TypeScript, a instância anterior permanece ativa. Encerramentos inesperados são registrados no terminal e recebem nova tentativa com intervalo de até 30 segundos.

O sino mostra somente alertas de créditos dos servidores: saldo de **3 ou menos**, com novo aviso ao chegar a zero. A consulta ocorre ao abrir o painel, ao abrir o sino e a cada minuto com a aba visível. Após recarregar acima desse limite, o alerta desaparece na próxima consulta. Limpar um alerta o dispensa enquanto o saldo continuar baixo; zerar o saldo gera um novo aviso.

Renovações e confirmações de PIX exigem saldo suficiente no servidor selecionado. O consumo é **telas × períodos × créditos do plano**. Saldo, validade, transação e confirmação do pagamento são gravados juntos; saldo insuficiente mantém a pendência sem alterar esses dados. Testes locais: `node --test packages/gestor/test/*.test.mjs`.

A navegação interna do painel usa AJAX: links, filtros e formulários atualizam o conteúdo preservando o menu e a barra superior. O dashboard reinicializa gráficos e mapas ao voltar; as consultas periódicas das telas são encerradas ao sair. Falhas de rede mantêm a página aberta, sem repetir salvamentos automaticamente. Login, logout e links externos continuam usando a navegação normal para trocar de sessão ou de site.

Para validar navegação, histórico, formulários, uploads e alinhamento dos cartões no Chrome local, execute na raiz: `node packages/gestor/test/navigation.browser.mjs`. O teste usa dados fictícios e não acessa o banco.
