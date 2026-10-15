# Segurança profissional 3.0 — revisão de 15/10/2026

## Parecer e escopo

**Código preparado com correções e ensaios locais; produção ainda não liberada por esta auditoria.** O ambiente autorizado pelo responsável foi **somente o local**. Nenhum banco remoto foi consultado, domínio sondado, serviço de produção reiniciado ou configuração de hospedagem alterada. Senhas existentes, integrações, MFA e recuperação de senha foram preservados.

O workspace já continha alterações das etapas 1.0/2.0 e de interface. Elas foram preservadas. Este documento complementa [SECURITY-ADVANCED.md](SECURITY-ADVANCED.md) e [SECURITY-REVIEW.md](SECURITY-REVIEW.md); os resultados históricos desses documentos não foram tratados como comprovação atual de produção.

Referência de avaliação: [OWASP ASVS 5.0.0](https://github.com/OWASP/ASVS/tree/v5.0.0/5.0), com foco em autenticação, sessões, autorização, criptografia, configuração e eventos. Esta é uma revisão com testes dirigidos, **não uma certificação ASVS nem uma comprovação exaustiva de todas as rotas e requisitos**.

## 1. Auditoria das proteções anteriores

| Controle | Evidência atual | Resultado e limite |
| --- | --- | --- |
| Autenticação no backend | `backend/src/auth/auth.service.ts`, controller de login e `scripts/security.test.mts` | Comparação bcrypt no servidor, resposta genérica, regeneração da sessão e limite por conta. Confirmado localmente. |
| Rotas privadas | `src/middleware/nativeRoutes.ts`, guards Nest e testes HTTP de clientes/features | Middleware exige sessão salvo lista pública explícita; guards protegem controllers privados. Portal, pagamentos por token, cron e webhooks têm credenciais e regras próprias. Não se deve classificar essas rotas públicas como sessão do painel. |
| Permissões administrativas | `src/middleware/auth.ts`, testes 1.0 e 3.0 | Consulta atual de `is_admin`; flag administrativa forjada no navegador/sessão não concede acesso. Escritas exigem autenticação recente. |
| Isolamento entre contas | Controllers recebem dono da sessão; consultas de clientes, catálogos, status, integrações, pagamentos e exportação usam proprietário | Testes negativos para IDs alheios, dono manipulado, integrações e confirmação de pagamentos. Abrangência dos testes não prova ausência de IDOR em toda evolução futura. |
| Invalidação de sessões | `sessionSecurity.ts`, revisão de credenciais e `session_version` | Senha, usuário, papel e versão revogam sessões na próxima requisição. Teste HTTP de múltiplas sessões e falha de banco aprovado. Operações já em execução não são canceladas. |
| Rate limiting compartilhado | `sharedRateStore.ts`, `loginAttempts.ts`, `rateLimits.ts` | SQL compartilhado em produção; duas conexões independentes e recriação de stores exercitadas em MariaDB local. Não foi feito teste distribuído de carga com processos/hosts da hospedagem. |
| Segredos no frontend | DTOs de clientes, conta e pagamentos, testes de dados aninhados | Senhas e credenciais salvas não preenchem telas/JSON comuns. Token público de pagamento e CSRF são credenciais de finalidade limitada, necessários ao fluxo. Exportação autorizada contém dados da conta e exige proteção própria. |
| Criptografia dos campos previstos | `secretVault.ts`, `storedSecrets.ts`, adaptadores e ensaio SQL | AES-256-GCM autenticado por finalidade/proprietário nos quatro campos previstos. Disponível no código; **sem keyring no ambiente configurado**, novas gravações ainda podem usar formatos anteriores. |
| Erros internos | `safeError.ts`, middleware, filtros e testes de falha de pagamento | Respostas genéricas em produção e diagnósticos permitidos nos caminhos testados. Desenvolvimento permite detalhes; não publicar com esse modo. Não foi demonstrada ausência de segredos em todo log de terceiros/inicialização. |
| Operações administrativas | `security_events`, `admin.denied`, `admin.critical` | Negação e solicitação de escrita registradas; isso não é trilha completa do resultado de cada ação nem armazenamento imutável. Exportações por conta agora também geram evento. |

Não foram recriados autenticação, criptografia, MFA, guards ou contadores já existentes.

## 2. Alterações desta etapa

1. **Consistência de backups:** `gerarDumpSql` agora reserva uma conexão da pool e usa transação de leitura com snapshot e isolamento REPEATABLE READ. Antes, SELECTs podiam observar momentos diferentes. Ensaio real com uma segunda conexão alterando dados fictícios comprovou a visão anterior no dump. A garantia pressupõe tabelas transacionais InnoDB e ausência de DDL durante o backup; confirmar engines e impedir migrações simultâneas no ambiente de destino. Ainda carrega o dump em memória e não inclui rotinas, contas SQL ou arquivos enviados.
2. **Exportações:** `/minha-conta/backup` mantém o escopo do dono autenticado, define `Cache-Control: no-store` e `Referrer-Policy: no-referrer` e registra `backup.exported` no mecanismo existente de eventos. A exportação JSON é um download autorizado por conta; não equivale ao dump completo cifrado e não recebe criptografia de arquivo automaticamente. Antes da migração, pode conter campos legados em texto puro.
3. **Seleção de configuração:** entrada gerada de hospedagem, supervisor, backend, worker e módulo de ambiente respeitam `GESTOR_ENV_FILE` antes de carregar dotenv. Arquivo explicitamente selecionado e ausente/inacessível interrompe a inicialização. Isso evita misturar `.env` padrão com configuração isolada. Variáveis já fornecidas ao processo continuam tendo precedência, conforme dotenv; revisar também as variáveis do serviço.
4. **Inspeção operacional:** novo CLI `security:production` e módulo `productionReview.ts`, sem importar inicialização de schema/rotinas da aplicação. Exige `--config`; sem `--database` não abre conexão SQL. A opção SQL usa uma conexão e transação somente de leitura, autentica envelopes v2 e devolve apenas contagens. Não mostra IDs, valores, chaves, URLs, SQL bruto ou mensagens internas. As leituras abrangem os quatro campos, têm custo proporcional aos registros e devem ocorrer fora de picos em bases grandes.
5. **Sinais locais:** o mesmo CLI agrega tentativas de login e ações administrativas de 15 minutos; opcionalmente verifica espaço livre e idade dos backups. Não instala agendamento, não envia notificações e não substitui plantão.

Saídas do novo CLI: `0` = nenhuma falha automatizada encontrada no escopo executado; `2` = bloqueios/alertas encontrados; `1` = inspeção incompleta. **Código 0 não libera produção**: as evidências de infraestrutura listadas continuam obrigatórias.

## 3. Criptografia, chaves e dados legados

Configuração local efetivamente inspecionada, sem imprimir valores:

| Item | Estado observado |
| --- | --- |
| Modo | development |
| Keyring / criptografia obrigatória | Ausentes/desativados |
| Banco configurado | Remoto, sem TLS configurado; **não acessado** |
| URL configurada | Usa HTTPS; certificado e redirecionamento público não consultados |
| Redirecionamento no servidor customizado | Não habilitado na configuração local |
| Segredos em arquivos rastreados | `.env`, `secrets/` e `*.keyring.json` não aparecem na consulta de arquivos rastreados atuais; histórico Git não auditado integralmente |
| Arquivo de chave ativo e permissões | Não há arquivo ativo para verificar ACL/permissões; não se pode atestar armazenamento externo |

Os quatro campos são `clientes.senha`, `integracoes.senha_enc`, `payment_provider_configs.credenciais` e `users.mp_access_token`. Hashes bcrypt do painel não são cifrados nem alterados pela migração. Novas gravações passam a ser cifradas quando há keyring válido e `DATA_ENCRYPTION_WRITE` não é `false`; `DATA_ENCRYPTION_REQUIRED=true` deve tornar ausência de criptografia uma falha de inicialização.

**Quantidade real de registros antigos: desconhecida.** Contar exigiria ler o banco remoto, fora da autorização recebida. O novo inventário diferencia texto puro, integração legada, v2 autenticado, chave anterior, v2 ilegível e v2 sem chave disponível. O formato legado de integração é classificado, mas sua autenticidade depende do CLI de migração com a chave legada.

Leitura com chaves anteriores, rotação, rejeição de chave ausente, adulteração de contexto e recuperação foram testadas com chaves aleatórias e dados fictícios. Keyrings desses ensaios ficam em diretórios temporários ignorados, não são chaves de produção. Ainda é necessário testar o backup e o keyring reais no ambiente isolado autorizado.

Ativação preparada, **não executada**: gerar chave fora do repositório/webroot/banco; restringir ACL ao usuário do serviço e responsáveis por recuperação (0600/0700 em POSIX); manter cópia cifrada separada; ensaiar restauração; simular migração; obter aprovação para DDL/migração/configuração/reinício; habilitar gravações e criptografia obrigatória; verificar zero texto puro/ilegível e fluxos existentes. Preservar chaves anteriores durante toda a retenção dos backups. Não rotacionar `SESSION_SECRET` enquanto integrações legadas dependerem dele. Usar os comandos e rollback documentados na etapa 2.0.

## 4. Hospedagem: evidências locais e mudanças pendentes

No Windows local, os perfis Domain, Private e Public do firewall estão habilitados. Na consulta realizada, não havia listeners nas portas 80, 443, 3000, 3001, 3002 ou 3306. Isso é apenas uma observação temporal do computador local; não comprova regras de entrada, indisponibilidade de outras portas ou segurança da hospedagem.

| Área | Verificação/alteração necessária antes de publicar |
| --- | --- |
| SSL/TLS e HTTPS | Conferir cadeia, hostname, validade, TLS aceito, renovação e redirecionamento HTTP→HTTPS no domínio autorizado. Configurar redirecionamento no proxy ou `ENFORCE_HTTPS=true` depois de testar ausência de loop. Nenhum domínio foi sondado. |
| Proxy e cabeçalhos | Definir apenas CIDRs dos proxies controlados; sobrescrever forwarding na borda; verificar HSTS, CSP, no-store, Permissions-Policy e ausência de X-Powered-By na resposta pública final. Código local não comprova que CDN preserva cabeçalhos. |
| Rede e banco | Restringir banco às origens necessárias e backend/worker a sockets/loopback. Banco remoto exige TLS validado, sem desativar verificação de certificado. Nenhuma regra ou conexão remota alterada. |
| Privilégios SQL | Inspecionar grants no servidor: conta da aplicação limitada ao schema; sem FILE/SUPER/GRANT OPTION/acesso global. Separar identidade operacional de migração. Avaliar grants restritos para monitor e inserção de auditoria. |
| Migrações na inicialização | `backend/src/main.ts` chama `ensureDatabaseSchema()` fora do modo local. Portanto, um início/reinício em produção pode executar DDL existente. Revisão e aprovação dessa etapa são necessárias antes de iniciar o build; não foi executada nesta entrega. |
| Arquivos privados e configuração | Webroot limitado aos assets; não servir `.env`, chaves, backups, logs, fontes privadas ou uploads não autorizados. Conferir usuário de serviço, ACLs de sockets/arquivos, proteção contra leitura por outros sites e backups fora do volume público. |
| Atualizações | Verificar versão efetiva de SO, runtime, MySQL/MariaDB e proxy; manter correções e ensaiar atualizações. A auditoria npm não cobre essas camadas. |
| Indisponibilidade | Confirmar limites de corpo/conexão/timeouts na borda, recursos do banco, health checks, disco e capacidade. Testes de carga/WAF em produção não autorizados. |

Não houve mudança de firewall, DNS, hospedagem, grants SQL ou variáveis reais.

## 5. Testes de autorização e sessões

`scripts/security-production.test.mts` adiciona nove testes versionáveis: inventário de segredos, sinais operacionais, snapshot/limpeza da conexão, exportação por dono com auditoria, ID de integração alheia, ID de pagamento alheio, flag administrativa forjada, inspeção sem vazamento e seleção isolada de ambiente.

As suítes anteriores e gerais exercitam HTTP real local com sessões/CSRF, rejeição de acesso anônimo, cliente de outro dono, manipulação de proprietário em query/body, mudança de privilégios, expiração/revogação, credenciais de pagamentos apenas no backend e integrações simuladas. Funções de pagamento por token derivam o proprietário do registro localizado pelo servidor, não de `userId` enviado pelo navegador.

Webhooks existentes consultam o provedor para atualizar o pagamento; o corpo recebido não é confirmação suficiente do status. Não foi feita chamada real a provedores. Validação de assinatura de webhook não foi identificada nesse fluxo: tratar autenticação do emissor e proteção contra abuso na borda como pendência de revisão específica por provedor, sem desativar integrações.

## 6. Monitoramento e resposta a incidentes

O feed `/admin/security/events` já exige administrador atual e autenticação recente. O CLI novo reaproveita essa tabela; não cria outro mecanismo de eventos. Exemplos **somente para configuração local isolada já preparada**:

```powershell
npm run security:production -- --config "C:/segredos/local.security.env"
npm run security:production -- --config "C:/segredos/local.security.env" --database --backup-dir "C:/backups/gestor-local"
```

Sem `--database`, a inspeção é de configuração/arquivos. A presença de um caminho local de configuração não torna local o banco nele declarado: verificar o destino antes da execução. Nesta entrega, SQL do CLI foi executado somente no MariaDB temporário em loopback. A configuração real foi inspecionada **sem** `--database`.

Política operacional proposta; instalar agendamentos e definir responsáveis depende de aprovação operacional:

| Sinal | Regra preparada | Resposta proposta |
| --- | --- | --- |
| Abuso de login | ≥10 falhas em 15 min ou qualquer `login.rate_limited` | Triagem em até 15 min; correlacionar HMAC de origem/conta no feed, sem registrar senha, cookie ou token. O limiar global exige ajuste ao tráfego. |
| Administração | Qualquer `admin.denied`; ≥10 `admin.critical` em 15 min | Conferir legitimidade, papel atual, origem e janela de mudança. Evento de escrita é intenção, não confirmação do resultado. |
| Exportação | `backup.exported` com severidade alert | Verificar dono e autorização; acompanhar volumes fora do padrão. |
| Erros críticos | `request.failed`, `security.persistence_failed`, falhas de startup/worker/backup nos logs locais; ≥5 falhas/minuto como ponto inicial | Coletor local precisa ler stderr e logs de serviços. A agregação SQL não detecta eventos que falharam ao persistir; esse coletor ainda não está instalado. Não encaminhar payloads para terceiros. |
| Disco | Aviso abaixo de 15% livre; crítico abaixo de 5% | Intervir antes de falhar backup/banco. Inspecionar também volume do banco e volume de chaves quando distintos. Não apagar arquivos automaticamente. |
| Backup diário | Ausente ou idade >26 h | Investigar job/worker, capacidade e restauração. mtime recente não autentica conteúdo nem comprova cópia independente. |

Retenção proposta: eventos/logs de segurança por 30 dias para consulta e até 180 dias em arquivo protegido; validar necessidade de dados e capacidade antes de adotar. Nenhum expurgo foi habilitado. A tabela atual permite alteração por quem tiver grants suficientes; **não é imutável**. Preparar cópia para armazenamento controlado por outra identidade, com retenção protegida e acesso auditado. HMAC de origem é pseudonimização, não anonimização absoluta.

Procedimento de incidente: (1) registrar horário, responsável e impacto sem copiar segredos; (2) preservar logs, hashes e cópia protegida de evidências; (3) confirmar origem e extensão; (4) propor contenção específica e obter aprovação antes de bloquear rede, reiniciar, revogar acessos ou rotacionar credenciais reais; (5) corrigir em ambiente isolado; (6) validar restauração/build e executar recuperação aprovada; (7) conferir integridade, pagamentos pendentes e reconciliação com provedores antes de retomar automações; (8) documentar causa, tempo de recuperação e medidas preventivas. Não reexecutar cobranças ou mensagens cegamente.

## 7. Backup, retenção e recuperação

Com keyring disponível, o backup diário gera envelope AES-GCM e verifica abertura antes de salvar. Sem keyring, permanece o formato SQL anterior; backups antigos não foram cifrados, apagados ou regravados. A opção de disco informa a quantidade de arquivos `.sql` não cifrados, sem abrir/expor seu conteúdo.

O ensaio local restaurou dump cifrado em outro schema vazio, recusou destino ocupado e comparou todas as linhas/tabelas incluídas; sessões e tentativas de login são excluídas intencionalmente. O teste preservou hashes de login e segredos fictícios, autenticou dados após rotação e verificou rejeição de chave ausente. Foi usado **MariaDB 11.8.3 temporário**, sem instalar serviço Windows, com porta/diretório/schemas próprios; o processo foi encerrado ao final. Isso não valida a versão nem a carga da hospedagem.

Política proposta: 14 cópias diárias, 8 semanais e 12 mensais cifradas, com pelo menos uma cópia em domínio de falha separado e chaves recuperáveis por responsáveis distintos. Não há agendamento de cópia independente, expurgo ou implementação de imutabilidade nesta entrega. Validar custo, capacidade e necessidade antes de adotar retenção.

**Objetivos propostos, ainda não medidos/aprovados: RPO ≤24 h e RTO ≤4 h.** O job diário só atende RPO se executar corretamente e houver cópia sobrevivente; banco e backup no mesmo disco não oferecem recuperação de perda total. Cobranças podem exigir RPO menor e estratégia adicional de logs/binlog homologada. RTO precisa ser medido com volume real, download das cópias, recuperação das chaves e reconciliação financeira.

Procedimento de falha crítica: preservar origem e backups; recuperar keyring completo por canal protegido; selecionar última cópia autenticada; restaurar com `security:restore` em banco **novo, vazio e isolado**, usando configuração explícita; comparar tabelas/linhas/valores e integridade referencial; verificar bcrypt, abertura de todos os campos v2 e chaves anteriores; testar login, segregação, integrações simuladas e pagamentos sem envio externo; medir RPO/RTO; obter aprovação para troca de destino e reinício; retomar automações após reconciliação. O CLI atual não deve ser usado para sobrescrever banco de produção. Uploads, configuração e chaves exigem recuperação separada do dump SQL.

## 8. Resultados e critérios de liberação

Executados nesta revisão:

- `npm run check`: tipagem, builds backend/React/navegador e 27 templates EJS aprovados.
- `node --import tsx --test scripts/security.test.mts scripts/security-advanced.test.mts scripts/security-production.test.mts test/*.test.mts`: **263 testes aprovados, zero falhas** (15 da etapa 1.0, 11 da 2.0, 9 desta etapa e 228 gerais).
- `npm run test:security:database`: snapshot concorrente, restauração cifrada/integridade de todas as linhas incluídas, migração/rollback, compatibilidade, rotação, contadores SQL e inspeção somente de leitura aprovados no banco fictício.
- `npm run test:security:csp`: Chrome bloqueou script injetado e handlers inline; nonce e ação legítima funcionaram.
- `npm run build:frontend`: build de produção Next aprovado localmente.
- `npm audit --omit=dev --json` e `npm audit --json`: **zero vulnerabilidades conhecidas reportadas**, incluindo o conjunto completo instalado. Sem atualização automática de dependências. Resultados brutos locais em `.tmp-ui/security-3-audit-runtime.json` e `.tmp-ui/security-3-audit-all.json`.
- `npm run security:production -- --config .env`: análise sem SQL encontrou `production-mode-disabled`, `encrypted-writes-disabled`, `encryption-not-required`, `remote-database-without-tls`; exit 2 esperado.

Artefatos locais de regressão/build: `.tmp-ui/security-3-regression.log` e `.tmp-ui/security-3-next-build.log`. Essa pasta é ignorada no Git; o relatório e os testes em `scripts/` são a documentação reproduzível. A suíte `test/` já era ignorada no projeto; não houve alteração dessa política.

Para liberar produção, ainda exigir: identificação e autorização do ambiente; evidências de TLS/proxy/firewall/SQL/ACLs; configuração de produção efetiva; inventário dos dados reais e migração aprovada; keyring fora do repositório com recuperação testada; backup real restaurado isoladamente; RPO/RTO medidos; revisão da DDL de inicialização; monitor local agendado com responsável e teste de alerta; validação da retenção/proteção de logs; smoke tests em homologação com a mesma topologia; aprovação específica de publicação e reinício. MFA e recuperação continuam sem ativação conforme solicitado.

Orientação para registros e exclusão de dados sensíveis baseada no [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html); armazenamento e ciclo de vida de chaves no [OWASP Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html). Testes locais, ausência de alertas npm e cabeçalhos no código não constituem comprovação de segurança em produção.
