# Gestor IXTV

**Versão atual: 0.1.0**

## Últimas atualizações — 07/10/2026

- Visual do painel revisado para desktop e celular, com ajustes em cards, formulários, modais e botões.
- Dashboard com resumo de clientes, acessos principais e adicionais e situação dos acessos por servidor.
- Status publicados no WhatsApp removidos automaticamente do painel após 24 horas.
- Automação com formulário contínuo e avisos considerando os dois acessos do cliente.
- Renovação pelo link do cliente com opção de selecionar um servidor ou renovar ambos.
- Melhorias de segurança no login, na conta e no portal do cliente.

## Executar o projeto

O servidor usa JavaScript diretamente em `src`, sem TypeScript e sem a pasta `dist`.

- `npm install`: instala as dependencias.
- `npm start`: inicia o servidor com a configuracao do ambiente.
- `npm run dev`: inicia localmente e reinicia ao alterar o backend.
- `npm run build`: verifica a sintaxe; nao gera arquivos duplicados.
- `npm test`: executa os testes.

Na hospedagem, use `npm start` ou `src/server.js` como arquivo de inicializacao.

## Estrutura do projeto

```text
src/                    Codigo JavaScript do servidor
  config/               Configuracao do ambiente
  db/                   Conexao e estrutura do banco
  middleware/           Autenticacao, seguranca e tratamento de requisicoes
  routes/               Rotas da aplicacao
  services/             Regras de negocio e integracoes
  shared/               Funcoes compartilhadas
  views/                Paginas, layout e componentes EJS
public/                 Arquivos servidos ao navegador
  assets/css/           Estilos
  assets/js/            Interacoes do navegador
  assets/images/        Logo e imagens da interface
  icons/                Icones de instalacao e atalhos
database/               SQL para configurar o banco
docs/reviews/           Relatorios de revisao visual e seguranca
scripts/                Inicializacao local e verificacao de sintaxe
test/                   Testes locais
```

O arquivo inicial do banco fica em `database/schema-hostinger.sql`.
A logo utilizada pelo sistema fica em `public/assets/images/ixlogo.png`.

Pastas locais auxiliares ficam fora do Git: `.tmp-ui` guarda verificacoes e capturas; `.deploy` guarda previas e materiais de publicacao. `node_modules` contem as dependencias instaladas.
