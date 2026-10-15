# Segurança 3.1 — correções finais — 15/10/2026

## Resultado e limite de autorização

Foram corrigidos o TLS SQL, a inicialização com migrações implícitas e o controle de automações. A proteção de webhooks foi implementada para os contratos confirmados de Mercado Pago, Asaas, OpenPix/Woovi e PagBank, com configuração explícita por conta. **O contrato de autenticação do Pagar.me v5 permanece pendente; não há validação inventada nem liberação de produção.**

As alterações permanecem no workspace. Não houve deploy, reinício produtivo, alteração de hospedagem/firewall, migração de dados reais, mudança de credenciais/senhas, cobrança ou mensagem real. MFA e recuperação de senha permanecem sem ativação.

**Ocorrência de isolamento:** durante o teste do código compilado, um subprocesso herdou variáveis de banco já carregadas do `.env`. Ele acessou o banco remoto configurado e executou uma consulta de leitura da tabela de versões; a consulta falhou porque a tabela não existia. O pool também configura o fuso da própria sessão ao conectar. Isso violou a instrução de não acessar bancos reais e foi comunicado durante a execução. Não houve INSERT/UPDATE/DELETE de dados reais, DDL ou execução de automações nesse subprocesso. Não foi feita outra consulta real para investigar. Portanto, **não é correto declarar zero acessos/operações no ambiente configurado nesta etapa**.

O harness foi corrigido: subprocessos recebem somente uma lista de variáveis do sistema operacional e configuração sintética explícita; host, porta e schema temporários são conferidos antes de executar. O teste compilado também confere a configuração efetiva da pool antes de abrir conexão. Há verificações que recusam sobrescrita para host remoto, porta fora do ensaio e schema alheio; credenciais de WhatsApp não são herdadas. Os ensaios posteriores passaram com esse isolamento corrigido.

## 1. TLS SQL

`src/security/databaseTls.ts` centraliza a política usada pela pool da aplicação e, por herança, pelo armazenamento de sessões/worker, além dos CLIs de migração de segredos, schema, restauração e inspeção.

- `rejectUnauthorized: true`, `verifyIdentity: true` e TLS mínimo 1.2; nenhum parâmetro configurável desliga a validação.
- Produção exige TLS, inclusive em TCP de loopback. CLIs também exigem TLS para banco remoto fora de produção.
- Em TLS, IP literal é recusado: a versão instalada do mysql2 condiciona sua checagem de identidade a nome DNS. Usar hostname coberto pelo certificado; não contornar com verificação desligada.
- `DB_SSL_CA` continua aceitando PEM, com `\n` escapado, e não caminho de arquivo. Sem CA explícita, aplica-se a confiança padrão do runtime.
- Conexões sem TLS são admitidas em laboratório/desenvolvimento local; os testes de protocolo com servidores falsos permanecem isolados.

**Evidência:** MariaDB portátil temporário em `127.0.0.1`, com certificados fictícios gerados pelo OpenSSL local. Conexão TLS correta negociou cipher; CA não confiável e hostname divergente foram recusados pelo driver antes das consultas do teste. Não foi validado certificado real da hospedagem.

**Compatibilidade/rollback:** manter mysql2 e armazenamento existentes. Hospedagem precisa fornecer DNS/cadeia válidos antes do rollout. Se falhar, interromper a implantação e corrigir a configuração/certificado; não retornar a TLS sem identidade ou a tráfego SQL produtivo sem criptografia.

## 2. Webhooks e operações financeiras

### Contratos implementados

| Integração existente | Validação implementada | Evidência oficial consultada |
| --- | --- | --- |
| Mercado Pago Orders API | HMAC-SHA256 do manifesto com `data.id` da query, `x-request-id` e timestamp; comparação constante, ID coerente com corpo e normalização documentada | [Orders — notificações](https://www.mercadopago.com.br/developers/en/docs/checkout-api-orders/optional-notifications) |
| Asaas PIX | Token dedicado em `asaas-access-token`, com comparação constante; não usar API key como token do webhook | [Introdução](https://docs.asaas.com/docs/about-webhooks) |
| OpenPix/Woovi PIX | RSA/SHA-256 sobre corpo original e chave pública confiável explicitamente configurada, header `x-webhook-signature` | [Validação SHA-256](https://developers.openpix.com.br/docs/webhook/seguranca/webhook-signature-validation) |
| PagBank Orders | Modalidade legada explícita SHA-256 de `token + '-' + corpo original` em `x-authenticity-token`; modalidade ECDSA/SHA-256 explícita para contrato novo com `x-payload-signature` e chave pública configurada | [Legado](https://developer.pagbank.com.br/reference/confirmar-autenticidade-da-notificacao), [novo contrato](https://developer.pagbank.com.br/reference/validacao-de-autenticidade) |
| Pagar.me Core v5 | Contrato de autenticação do emissor não confirmado; callback de pagamento conhecido retorna 503 sem processamento financeiro | [Visão geral v5](https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-webhooks) |

Não há tentativa de buscar chaves em URLs recebidas no webhook. Algoritmo e tipo de chave são fixados por modalidade; chave pública e segredo são escolhidos pela conta do pagamento encontrado no banco, nunca pelo dono informado pelo navegador ou corpo.

No Mercado Pago, `timestampToleranceMs` é opcional e só deve ser definido depois de homologar o comportamento de retentativa do produto. A assinatura pode continuar válida numa nova entrega; não se presume renovação de timestamp em todo retry. Sem tolerância configurada, repetições são protegidas pela idempotência persistida, não por descarte baseado apenas na idade.

### Fluxo preservado e reforçado

O parser conserva bytes originais de JSON somente nas rotas `/webhook/`; controller/service encaminham headers, query e raw body. Primeiro se localiza recurso conhecido, recusa-se ID ambíguo entre contas e valida-se a autenticidade; depois permanece a consulta de confirmação ao provedor com as credenciais do proprietário.

Antes de escrever, o resultado da API precisa corresponder ao ID, valor decimal exato, moeda BRL e referência externa esperada. PIX Asaas/OpenPix/Orders usa o contrato BRL quando a API não informa moeda; se a API devolver outra moeda, a atualização é recusada. Não foi acrescentado suporte a pagamentos em outras moedas.

Novas cobranças recebem referência por conta/cliente e pedido, persistida em `pagamentos.external_reference`. OpenPix passa a ter identificação distinta por cobrança, evitando reutilizar o mesmo identificador em ciclos diferentes. A referência de cliente usada para reaproveitar Customer no Asaas continua estável. Registros antigos continuam aceitando a referência legada `cliente=<id>` quando confirmada pela API. Identificadores duplicados já existentes entre contas são recusados e exigem reconciliação, sem alteração automática dos registros.

Updates usam transação com `FOR UPDATE`, proprietário, cliente e identificador do provedor. Entregas repetidas não repetem a transição; notificações continuam usando a reivindicação transacional existente, a unicidade de `pagamento_id` e `user_notificado`. Não foi criado outro mecanismo de renovação/débito. Status pending atrasado não reabre pagamento aprovado; confirmação de estorno/chargeback pelo provedor pode atualizar o status conforme o fluxo existente, sem novo aviso de aprovação.

Erros de autenticação retornam 401; divergência de confirmação retorna 422; ambiguidade retorna 409; configuração ausente, contrato pendente e falhas transitórias retornam 503 para permitir retentativa. Eventos sem recurso suportado ou recurso não encontrado são reconhecidos sem processamento financeiro. Respostas 200 não são enviadas antes de concluir a operação interna processada. Não foi adicionada fila assíncrona nova; medir tempo de resposta na homologação.

### Configuração pendente, sem modificar credenciais existentes

Definir `WEBHOOK_SECURITY_FILE` apontando para JSON privado fora do repositório/webroot, legível apenas pelo serviço e custodiante. Não foi criado arquivo produtivo. Estrutura ilustrativa, **valores abaixo são placeholders e não devem ser usados como segredos**:

```json
{
  "ID_DA_CONTA": {
    "mercadopago": { "mode": "hmac-sha256", "secret": "SEGREDO_DE_WEBHOOK_DA_APLICACAO" },
    "asaas": { "mode": "token", "secret": "TOKEN_DE_WEBHOOK_FORTE_E_DEDICADO" },
    "openpix": { "mode": "rsa-sha256", "publicKey": "CHAVE_PUBLICA_PEM_CONFIAVEL" },
    "pagbank": { "mode": "legacy-sha256", "secret": "TOKEN_EXISTENTE_DO_CONTRATO_LEGADO" }
  }
}
```

Para PagBank no contrato novo confirmado: `mode: ecdsa-sha256` com `publicKey` PEM. Não selecionar modalidade por tentativa e erro, nem aceitar ambas automaticamente. Conferir disponibilidade/endpoint produtivo do novo serviço com o provedor. A configuração não é devolvida aos formulários e não altera senhas/tokens existentes.

**Bloqueio:** este build não deve ser publicado sem configurar e homologar a autenticação de cada provedor ativo. Pagar.me continua integrado para criação/consulta, mas seu callback conhecido fica pendente de autenticação confirmada; publicar assim em uma instalação que dependa dele interromperia atualizações automáticas. Não declarar essa integração totalmente corrigida.

**Limitação de entrega externa:** uma única reivindicação de aviso não oferece garantia de entrega exatamente uma vez de WhatsApp/push diante de queda entre commit e envio. O comportamento de melhor esforço existente foi preservado; não foi implementado outbox. Retentativas de falhas internas antes da reivindicação são possíveis sem nova renovação ou débito. Reconciliar avisos financeiros pelo painel/provedor.

## 3. Migrações explícitas e startup

`ensureDatabaseSchema()` foi dividido em aplicação estrutural e transformação comercial legada. O backend e o worker agora usam `verifyDatabaseSchema()`: apenas SELECTs de compatibilidade e versão. Sem schema compatível, startup falha antes de iniciar automações. `createSessionStore()` usa `createDatabaseTable: false`; a tabela de sessões passa a fazer parte da migração estrutural.

O novo `security:schema` exige arquivo explícito e apenas apresenta plano sem `--apply`, sem conectar ao banco. A aplicação estrutural usa uma conexão, trava nomeada `GET_LOCK` por schema, ledger `schema_migrations`, versão e checksum do manifesto. A versão só é marcada ao concluir. Início repetido não executa seeds, atribui trial, redefine provedor ou altera planos/preços. Mudanças futuras no manifesto exigem nova versão; a verificação não é assinatura do artefato inteiro.

A migração estrutural reaproveita CREATE/ALTER existentes, prepara sessões, amplia campos de segredos e identificador do provedor para sua capacidade necessária e adiciona `pagamentos.external_reference`. Não altera valores comerciais. DDL MySQL/MariaDB não é transacional integralmente: falha pode deixar expansão parcial sem versão final; revisar estado e reaplicar em ensaio, nunca forçar downgrade destrutivo.

As operações comerciais anteriores continuam disponíveis exclusivamente no CLI com `--business --approve-business`, além de `--apply`. Para aplicá-las, também se exige `--restore-tested --business-backup <backup-integral-cifrado>` autenticado, do mesmo schema e legível com o keyring. Elas rodam em transação de dados com versão própria e não ignoram erros silenciosamente. Isso preserva a possibilidade de inicializar uma instalação nova/importar o legado, sem executar essas alterações a cada início. Nenhuma migração comercial foi executada nesta entrega.

### Comandos futuros — somente laboratório e depois alvo aprovado

```powershell
# Arquivo deve apontar para banco de homologação isolado, com identidade SQL própria.
npm run security:schema -- --config "C:/segredos/homologacao.security.env"
npm run security:schema -- --config "C:/segredos/homologacao.security.env" --apply
```

O primeiro comando não é um diff real do banco: é um plano das operações selecionadas. O segundo altera schema e só deve ser executado após revisar backup/delta e obter autorização para aquele alvo. Produção exige ainda `MIGRATION_ENVIRONMENT=production` e `--approve-production`; a flag não substitui autorização. Não usar `--business` na implantação estrutural de uma instalação existente por conveniência.

**Rollback:** preservar build compatível com criptografia v2, versão anterior de configuração e backup integral restaurável. Manter colunas ampliadas e dados novos; não remover tabelas nem reverter ledger manualmente para obrigar reaplicação. Em falha estrutural, revalidar estado e escolher correção progressiva ou restauração em outro banco. Transformações comerciais exigem procedimento de reversão por estado anterior, aprovado; o CLI não executa down migration automática nem promete desfazer DDL por ROLLBACK. O rollback de segredos permanece separado e não restaura dados comerciais.

## 4. Automações

Uma política compartilhada exige simultaneamente `LOCAL_MODE=false` e `RUN_AUTOMATIONS=true`. Ausência da flag equivale a desativado. Ela protege início dos timers do worker, funções de execução automática e endpoints de cron local/proxy. Token correto sozinho não habilita cron desativado.

O supervisor encaminha o opt-in explicitamente ao worker e ao backend; o backend não inicia timers duplicados. O worker ainda pode escutar saúde/cron enquanto desativado, mas não cria timers e o endpoint recusa execução. O launcher separado do backend mantém o opt-in para encaminhamento, sem iniciar timers próprios.

Em homologação com dados copiados: `RUN_AUTOMATIONS=false` e rede sem egress para serviços reais continuam necessários. A flag controla rotinas automáticas, **não bloqueia ações manuais** de envio/cobrança feitas por usuário; usar sandbox/fixtures e não acionar funções reais. Em produção futura, habilitar somente depois de aprovação e reconciliação da janela. Deploy sem configurar a flag deixa as automações desativadas por segurança.

## 5. Arquivos alterados nesta etapa

O workspace já continha alterações das etapas anteriores. Esta lista identifica o escopo 3.1, não atribui a esta etapa todo o diff do Git.

| Área | Arquivos |
| --- | --- |
| TLS | `src/security/databaseTls.ts`, `src/config/env.ts`, `scripts/migrate-secrets.mts`, `scripts/restore-backup.mts`, `scripts/security-production.mts`, novo `scripts/migrate-schema.mts` |
| Webhooks/transporte | `src/security/paymentWebhooks.ts`, `src/config/http.ts`, `backend/src/payments/payments.controller.ts`, `payments.service.ts`, `payments.types.ts` |
| Pagamentos | `src/services/paymentWorkflow.ts`, `src/workflows/payment-defaults.ts`, `src/services/renovacoesPendentes.ts`; adaptadores `src/services/providers/{mercadopago,asaas,openpix,pagbank,pagarme}.ts` |
| Schema/startup | `src/db/schema.ts`, novo `src/db/migrations.ts`, `src/db/cobrancasEnviosSchema.ts`, `src/db/sessionStore.ts`, `backend/src/main.ts`, `backend/src/worker.ts` |
| Automações | `src/security/automationPolicy.ts`, `src/workflows/cron.ts`, `worker-proxy.ts`, `src/services/cobrancasCron.ts`, `statusCron.ts`, `scripts/run-stack.mts`, `scripts/start-backend.mts` |
| Comandos/testes | `package.json`, novo `scripts/security-31.test.mts`, `scripts/security-local-db.mts`, fixture de configuração em `scripts/security.test.mts` |
| Fixtures existentes ignoradas pelo Git | `test/application.test.mts`, `cobrancas-acessos.test.mts`, `runtime.test.mts`, `nest-features.test.mts`, `nest-payments.test.mts`, `next-api.test.mts`, `hosting-stack.test.mts` |
| Documentação | Este relatório e nota de atualização no `SECURITY-DEPLOYMENT-PLAN.md` |

As fixtures passaram a declarar opt-in de automação e gerar assinaturas/tokens sintéticos; os caminhos positivos continuam sendo exercitados. O teste antigo de migração de cobranças agora chama a migração explícita. Suítes novas permanecem em `scripts/` para versionamento.

## 6. Testes e resultados

- `npm run check`: tipagem backend/serviços/Next/navegador/worker, builds backend/React/browser e 27 templates EJS aprovados.
- Suítes `security.test.mts`, `security-advanced.test.mts`, `security-production.test.mts`, `security-31.test.mts` e `test/*.test.mts`: **274 testes aprovados, zero falhas** na execução final registrada. São 15 + 11 + 9 + 11 testes de segurança e 228 gerais.
- `npm run test:security:database`: TLS SQL com certificado correto/CA errada/hostname divergente; backup/restauração cifrada com comparação das linhas incluídas; rotação/rollback; contadores compartilhados; CLI de schema em banco fictício; compatibilidade de versão entre TS e JS compilado; startup repetido e trava entre conexões; oito callbacks autenticados concorrentes com uma pendência e envios simulados. Reexecutado após corrigir a herança de ambiente do subprocesso.
- `npm run test:security:csp`: Chrome bloqueou script injetado e handlers inline; nonce e ação legítima funcionaram.
- `npm run build:frontend`: build Next de produção aprovado localmente.
- Teste dirigido `concurrent hosting instances` em `test/hosting-stack.test.mts`: supervisor propagou `RUN_AUTOMATIONS=false` e `true` aos processos simulados, sem execução de cron real.
- `git diff --check`: sem erros de whitespace na conferência.

Não se atribui a esta etapa uma nova auditoria npm: o resultado zero da etapa 3.0 é histórico; repetir audit no artefato final antes de publicar. Os logs locais de regressão e build são `.tmp-ui/security-31-regression-final.log` e `.tmp-ui/security-31-next-build.log`; a pasta é ignorada. Houve falhas intermediárias corrigidas e a ocorrência de isolamento descrita acima; os resultados finais não apagam esse histórico.

Os bancos usados nos ensaios deliberados foram MariaDB 11.8.3 portátil, schemas próprios e contas fictícias; o processo temporário foi encerrado ao final. A falha de isolamento foi uma exceção expressamente registrada, não uma validação de produção.

## 7. Funcionalidades preservadas e riscos restantes

Login, sessões separadas, revogação, permissões administrativas, filtros de proprietário, CSRF/CSP, telas e integrações existentes, geração de PIX, renovação manual com controle de créditos, criptografia/compatibilidade legada e recuperação permanecem nos fluxos testados. Não houve edição de senhas, migração de campos reais, ativação de MFA ou alteração de provedores no painel.

Persistem: contrato Pagar.me v5; configuração real das chaves/segredos de webhook por conta e confiança/rotação de chaves públicas; validação da topologia e dos certificados reais; migração de schema/dados na versão SQL da hospedagem; backup real restaurado isoladamente; entrega automática dos alertas; privilégios/ACLs e retenção; entrega externa de mensagens diante de queda; medição de RPO/RTO e tempos de resposta dos provedores. Segredos/IDs duplicados ou referências divergentes já existentes não são corrigidos silenciosamente: exigir análise e autorização específicas.

## 8. Checklist de homologação e implantação

| Estado | Verificação |
| --- | --- |
| PRONTO LOCAL | Cadeia e identidade SQL exigidas, com testes positivos/negativos no driver real |
| PRONTO LOCAL | Autenticidade dos quatro contratos confirmados; raw body; validação de confirmação e concorrência |
| PRONTO LOCAL | Startup sem DDL/DML comercial; sessões sem auto-create; CLI versionado e trava SQL |
| PRONTO LOCAL | RUN_AUTOMATIONS=false bloqueia timers, funções automáticas e cron HTTP; opt-in positivo testado com mocks |
| PRONTO LOCAL | Regressão, criptografia, backup/restauração e build aprovados |
| CORRIGIDO NO HARNESS | Subprocessos sem herdar ambiente da aplicação, com conferência do alvo antes de conectar |
| BLOQUEIA SE ATIVO | Confirmar e implementar contrato do Pagar.me antes de publicar onde ele processa pagamentos |
| CONFIGURAR/VALIDAR | DNS SQL, CA/certificado válido, conta de serviço e credenciais de sandbox na homologação |
| CONFIGURAR/VALIDAR | WEBHOOK_SECURITY_FILE privado; contrato PagBank correto; chaves/tokens por conta; assinatura real de sandbox |
| CONFIGURAR/VALIDAR | Revisar delta estrutural, privilégios, migração explícita e rollback em clone da versão SQL do host |
| CONFIGURAR/VALIDAR | Restaurar backup real isoladamente mediante nova autorização, recuperar chaves e medir RPO/RTO |
| CONFIGURAR/VALIDAR | Homologar todos os fluxos com automações desativadas e egress isolado; testar opt-in só em sandbox |
| CONFIGURAR/VALIDAR | Alertas automáticos, heartbeat, responsável, logs protegidos e reconciliação de eventos |
| BLOQUEIA | Aprovação específica de backup, migração, configuração, publicação e restart reais ainda não concedida |

O plano anterior deve ser lido com esta atualização: **migrar schema explicitamente antes de iniciar o novo build**, configurar TLS e webhooks, manter automações desligadas durante homologação e resolver Pagar.me onde ativo. Produção não está liberada por testes locais.
