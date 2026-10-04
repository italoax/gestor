# Gestor Node.js

Painel responsivo para gerenciar clientes, planos, servidores, vencimentos e pagamentos PIX, com integração WhatsApp por uma API separada.

## Tecnologias

Node.js, TypeScript, Express, EJS e MySQL/MariaDB.

## Executar localmente

Configure o arquivo `.env` com as credenciais do banco e da API WhatsApp. Os dados privados não devem ser publicados no GitHub.

```powershell
npm.cmd install --include=dev
npm.cmd run start:local
```

## Gerar pacote para hospedagem

```powershell
npm.cmd run deploy
```

A API WhatsApp é mantida separadamente. Esta pasta contém somente o painel.
