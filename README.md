# Gestor IXTV

**Versão atual: 0.1.0**

## Últimas atualizações — 04/10/2026

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
