# Gestor IXTV

**Versão atual: 0.1.0**

## Últimas atualizações — 07/10/2026

- Visual do painel revisado para desktop e celular, com ajustes em cards, formulários, modais e botões.
- Dashboard com resumo de clientes, acessos principais e adicionais e situação dos acessos por servidor.
- Status publicados no WhatsApp removidos automaticamente do painel após 24 horas.
- Automação com formulário contínuo e avisos considerando os dois acessos do cliente.
- Renovação pelo link do cliente com opção de selecionar um servidor ou renovar ambos.
- Melhorias de segurança no login, na conta e no portal do cliente.

## Últimas atualizações — 04/10/2026

- Logo IX TV nos atalhos da tela inicial do iPhone e nos icones de instalacao.

- Scripts locais reunidos em um arquivo, com cache de compilação e recompilação incremental para iniciar mais rápido.
- Removidos os scripts separados de ZIP, limpeza e desenvolvimento; deploy mantido pelo GitHub.

- Integrações de pagamento com limite de espera, evitando requisições travadas.
- Cache do dashboard atualizado após alterações e confirmações de renovação, com limite de memória.
- Limites de conexões e filas do banco de dados ajustados.
- Encerramento das rotinas agendadas e sessões durante deploys e reinicializações.
- Monitoramento em `/healthz` independente da sessão, com timeout na consulta ao banco.
- Tratamento de erros das requisições JSON e da inicialização do servidor HTTP.
- Dependência `mysql2` atualizada para corrigir vulnerabilidades, inclusive nas sessões.
- Compressão MySQL desativada e testes de proteção contra descompressão excessiva.
- Instalação do TypeScript corrigida para o deploy automático na Hostinger.
