# Recuperação da inicialização — migração estrutural pendente

## Atualização: migração aplicada com autorização

Após o responsável informar que acabara de fazer backup e autorizar prosseguir, a migração estrutural foi aplicada em 15/10/2026. A verificação posterior terminou às **17:17:10 UTC (14:17:10 em São Paulo)**. O backup foi confirmado pelo responsável; sua restauração não foi verificada independentemente nesta execução.

Antes da escrita, destino, TLS, engines, colunas e índices foram revalidados contra os metadados do plano. O CLI existente foi executado com `MIGRATION_ENVIRONMENT=production`, `--approve-production --apply`, **sem `--business`**, usando configuração temporária protegida e removida após o uso. Não foi importado SQL avulso nem iniciado o backend/worker.

Resultado confirmado por consultas posteriores: quatro tabelas criadas, duas colunas adicionadas, três campos ampliados, versão `20261015-31-structural` registrada com checksum esperado. As três consultas de compatibilidade executadas pelo startup (`sessions.session_id`, `users.session_version`, `pagamentos.external_reference`, todas com LIMIT 0) passaram. Nenhum registro comercial foi lido para essas verificações.

Não houve alteração de senhas, credenciais, planos ou preços por DML, migração comercial, cobrança, mensagem, publicação, reinício ou ativação de automações. As operações CREATE/ALTER e o registro de versão **foram alterações reais autorizadas no banco**, não testes exclusivamente locais. A autenticação funcional e o startup completo na hospedagem ainda não foram verificados. Produção não recebe liberação geral por este resultado.

Evidência local sem credenciais: `.tmp-ui/security-schema-application-result.json` (ignorada no Git). As seções abaixo preservam o diagnóstico, plano e ensaio anteriores à aplicação; a pendência de autorização para este delta foi encerrada pela autorização subsequente do responsável.

## Diagnóstico e escopo

Em 15/10/2026, após autorização para investigar a falha, foram consultados somente metadados do banco configurado, via TLS com cadeia e hostname validados. Nenhuma tabela de negócio foi lida, nenhuma migração foi executada e nenhum serviço foi iniciado/reiniciado nesta preparação.

O servidor informou MariaDB 11.8.9. A inspeção encontrou 30 tabelas; `schema_migrations` está ausente, explicando `ER_NO_SUCH_TABLE` na primeira consulta de `verifyDatabaseSchema()`. A presença de `sessions`, `users` e `pagamentos` não basta: também faltam estruturas da etapa 3.1.

## Delta concreto para aprovação

[SECURITY-SCHEMA-RECOVERY.sql](SECURITY-SCHEMA-RECOVERY.sql) contém as dez operações efetivas previstas pelo migrador estrutural, comparadas com os metadados observados:

1. Criar `schema_migrations`, `security_rate_limits`, `security_events` e `auth_login_attempts`.
2. Adicionar `users.session_version`, inteiro com padrão 0, e `pagamentos.external_reference`, texto opcional.
3. Ampliar `clientes.senha` de VARCHAR(190) para TEXT, `users.mp_access_token` de VARCHAR(255) para TEXT e `pagamentos.mp_payment_id` de VARCHAR(40) para VARCHAR(200). Não há recifragem ou troca dos valores nesta operação.
4. Registrar versão `20261015-31-structural` e checksum no histórico, **somente depois de concluir a estrutura**.

O plano foi produzido reaproveitando `runSchemaMigrations()` com conexão simulada alimentada apenas pelos metadados: nenhum DDL foi enviado ao banco real. O SQL é artefato de revisão, não deve ser importado diretamente para contornar a trava de concorrência do CLI. Revalidar o delta imediatamente antes da execução: concorrência ou outro deploy podem mudar a estrutura.

Não será usado `--business`. Não há UPDATE/DELETE de dados comerciais, alteração de planos/preços/trial, troca de senhas ou credenciais, ativação de automações, MFA ou recuperação de senha. CREATE/ALTER são alterações reais e DDL pode causar commit implícito, locks, reconstrução de tabelas e interrupção de escritas. Não afirmar atomicidade ou rollback transacional integral.

## Ensaio já concluído

`npm run test:security:database` reproduziu o estado legado em um schema **fictício** no MariaDB portátil 11.8.3, loopback e credenciais aleatórias. Somente nesse laboratório foram removidas as estruturas recém-criadas pelo próprio teste e reduzidos os campos para simular o legado. Nenhum dump/dado real foi copiado.

O ensaio confirmou a falha de startup antes da correção, aplicou exatamente as dez instruções do SQL revisado e validou o startup após a correção. As linhas fictícias de usuários ficaram idênticas, inclusive hashes, token e datas. As verificações existentes de preservação de plano/preço, repetição de migração, trava entre conexões, criptografia, backup/restauração e pagamentos concorrentes também passaram. Log local ignorado: `.tmp-ui/security-schema-recovery-test.log`.

`npm run typecheck` e `git diff --check` passaram. O ensaio não comprova duração/locks no servidor real e não reproduz exatamente a versão 11.8.9 da hospedagem. Teste local aprovado não libera produção.

## Procedimento real preparado, não executado

Pré-condições: autorização explícita de migração estrutural no banco identificado; backup integral recente, protegido e comprovadamente recuperável; janela e responsável por recuperação; delta revalidado; comando de deploy/restart separado e aprovado. Não presumir backup existente nem que autorização de consulta permita copiar dados reais. Se for preciso gerar/restaurar backup real, obter essa autorização específica.

Preparar configuração exclusiva protegida, fora do repositório, preservando credenciais/segredos atuais e incluindo:

```dotenv
MIGRATION_ENVIRONMENT=production
DB_HOST=srv1182.hstgr.io
DB_PORT=3306
DB_SSL=true
DB_TRANSPORT=tls
RUN_AUTOMATIONS=false
```

O comando de prévia existente não conecta ao banco e não calcula o delta real; o delta desta revisão consta no SQL anexado:

```powershell
npm run security:schema -- --config "CAMINHO_CONFIG_APROVADA" --approve-production
```

Somente após todas as pré-condições e aprovação explícita, executar:

```powershell
npm run security:schema -- --config "CAMINHO_CONFIG_APROVADA" --approve-production --apply
```

Não usar `--business`, `LOCAL_MODE=true`, alterar NODE_ENV para contornar validações ou inserir a versão manualmente. O migrador adquire trava por schema, cria somente o que falta e registra checksum. Falha em DDL pode deixar alterações parciais: inspecionar o estado antes de retentar, sem marcar versão como concluída.

Depois, conferir somente a versão/checksum e colunas/tabelas esperadas, sem abrir dados sensíveis. A verificação de startup deve permanecer apenas leitura. Não iniciar worker nem backend sobre a base real como parte do ensaio sem autorização de reinício; não enviar cobranças/mensagens para smoke test. A ativação de criptografia dos valores reais é uma etapa separada.

## Contingência

Se houver falha, interromper o avanço e preservar logs. Não executar DROP, reduzir colunas, apagar registros de versão ou restaurar sobre a base ocupada. As ampliações são compatíveis com leitores anteriores; retorno de build só pode usar versão conhecida compatível com v2 e TLS e depende de aprovação de publicação/reinício. Se houver dano estrutural ou necessidade de restauração integral, recuperar a cópia em outra base isolada, validar e solicitar aprovação para troca do destino, considerando perdas dentro do RPO aprovado. Nenhuma down migration destrutiva foi preparada.

**Pendente:** confirmação de backup recuperável e autorização explícita para o delta produtivo. A instrução anterior do responsável exige aprovação específica antes de migrações reais; a preparação não substitui essa aprovação.
