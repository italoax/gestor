# Plano final de implantação segura — 15/10/2026

> Atualização 3.1: consultar [correções finais e checklist atualizado](SECURITY-FINAL-FIXES.md). O código agora exige identidade TLS, valida os contratos de webhook confirmados, separa migração explícita do startup e respeita RUN_AUTOMATIONS. Os trechos abaixo registram o diagnóstico anterior; a sequência de migração/startup deve seguir a atualização. Pagar.me v5 permanece pendente. O relatório 3.1 também registra uma ocorrência de acesso de leitura fora do isolamento previsto durante os testes, sem migração ou alteração de dados reais.

## Decisão e alcance

**Liberação pendente.** Este plano consolida os relatórios [1.0](SECURITY-REVIEW.md), [2.0](SECURITY-ADVANCED.md) e [3.0](SECURITY-PRODUCTION.md) e confere seus procedimentos contra o código atual. Nenhuma funcionalidade foi reimplementada. Nesta preparação foram feitas apenas leituras do repositório e consulta de documentação pública; não foram executados os comandos operacionais abaixo, acessos ao banco real, alterações de produção ou novos testes de homologação.

O único ambiente anteriormente autorizado para execução foi o local. **Todos os comandos deste documento são instruções para execução futura**, depois de identificar e autorizar o alvo. `--approve-production` é uma trava de CLI, não uma autorização do responsável. Aprovação para leitura não autoriza backup com dados reais, migração, configuração de provedores, agendamento, publicação ou reinício.

Os 263 testes, builds e restauração fictícia aprovados pertencem à evidência da etapa 3.0. Os testes precisam ser repetidos para o artefato final. Nenhum desses resultados comprova TLS, recuperação ou segurança de produção.

## Sequência e responsáveis

| Ordem | Etapa | Responsável necessário | Condição para avançar |
| --- | --- | --- | --- |
| 0 | Congelar artefato e identificar alvos | Desenvolvimento + responsável pela operação | Build anterior compatível, configuração preservada e destinos conferidos |
| 1 | Preparar keyring e ativação da criptografia | Operação + custodiante das chaves | Chaves recuperáveis, plano de migração conhecido; sem gravação real ainda |
| 2 | Validar TLS e hospedagem | Operação/DBA | Canal SQL autenticado e topologia/regras de acesso comprovados |
| 3 | Restaurar backup real isoladamente | DBA + responsável pelos dados | Integridade e recuperação das chaves comprovadas; RPO/RTO medidos |
| 4 | Revisar autenticação de webhooks | Desenvolvimento + responsável pelos pagamentos | Autenticidade, isolamento e repetição testados para cada provedor ativo |
| 5 | Preparar monitoramento automático | Operação + pessoa de plantão | Agendamento, entrega de alerta e falha do monitor testados |
| 6 | Controlar migrações e inicialização | Desenvolvimento + DBA | Delta SQL aprovado e inicialização sem alteração comercial imprevista |
| 7 | Homologação final e ensaio de reversão | QA + operação | Mesma topologia de produção, testes e rollback aprovados |
| 8 | Ativar e publicar na janela aprovada | Responsável pela liberação | Aprovação explícita, backup recente e condições anteriores atendidas |

A prioridade da criptografia não muda sua dependência: **a migração dos dados reais só ocorre depois de TLS, restauração, revisão de inicialização e homologação**. Preencher nomes, janela, contatos, artefato/commit aprovado, hash do build e limites de interrupção antes da etapa 8.

## 0. Preparação do artefato e dos alvos

Executar em checkout de release separado, com as alterações aprovadas preservadas. Há arquivos de segurança ainda não rastreados no workspace: conferir sua inclusão no artefato. A pasta `test/` é ignorada no Git; garantir disponibilidade na validação/CI ou usar também as suítes versionáveis de `scripts/`. Não limpar o workspace com alterações existentes.

```powershell
git status --short
git diff --check
git ls-files SECURITY-REVIEW.md SECURITY-ADVANCED.md SECURITY-PRODUCTION.md scripts src/security
npm ci
npm run build
npm run test:security
npm run test:security:advanced
npm run test:security:production
npm test
npm audit --omit=dev
```

`npm ci` altera dependências locais e executa postinstall; usar somente no checkout de release/CI, sem credenciais produtivas e sem egress para integrações reais. `npm run build` gera backend, frontend e entrada de hospedagem; não publica. Preservar lockfile e arquivar o artefato aprovado fora do webroot.

Convenção dos exemplos PowerShell, **substituir caminhos e conferir seus destinos antes de usar**:

```powershell
$prodConfig = 'C:/segredos/producao.security.env'
$backupConfig = 'C:/segredos/backup-origem.security.env'
$stageConfig = 'C:/segredos/homologacao.security.env'
$restoreConfig = 'C:/segredos/restauracao-isolada.security.env'
$keyring = 'C:/segredos/gestor-prod-k1.keyring.json'
$fullBackup = 'C:/backups/gestor-pre-ativacao-20261015.sql.enc'
$migrationBackup = 'C:/backups/gestor-migracao-20261015.enc'
```

Em Linux, usar caminhos absolutos equivalentes. Não copiar segredos para comandos, histórico, relatório, Git, argumentos HTTP ou arquivos públicos. Configurar arquivos secretos via canal protegido; manter o `SESSION_SECRET` existente e o segredo legado necessário. Uma configuração local pode apontar para banco remoto: conferir **host + porta + schema + identidade SQL + destino dos arquivos**, sem exibir senhas.

**Riscos:** publicar arquivos incompletos, configuração herdada do processo prevalecer sobre dotenv, voltar a build sem leitor v2. **Verificação:** inventário do artefato e configuração efetiva de todos os processos. **Rollback:** descartar apenas o checkout de release novo; preservar build/configuração anteriores e todas as chaves. Não usar `git reset --hard` no workspace compartilhado.

## 1. Keyring e preparação da criptografia real

### Comandos e configuração

Depois de aprovada a criação/guarda das chaves, em diretório externo ao repositório, webroot e banco, já criado com acesso restrito:

```powershell
npm run security:keys -- --file "$keyring" --id prod-k1
icacls "$keyring"
```

No Windows, o gerador restringe ao usuário que o executa e SYSTEM: conceder leitura ao usuário real do serviço e verificar ACLs do diretório, sem liberar outros usuários/sites. Não copiar uma ACL de desenvolvimento para produção. Em POSIX, verificar também proprietário, modo e diretórios ancestrais:

```sh
stat -c '%a %U %G' /srv/gestor-secrets/gestor-prod-k1.keyring.json
namei -l /srv/gestor-secrets/gestor-prod-k1.keyring.json
```

Arquivo da **futura execução produtiva**, preenchido por operação com valores protegidos:

```dotenv
NODE_ENV=production
LOCAL_MODE=false
COOKIE_SECURE=true
APP_URL=https://DOMINIO_APROVADO
DATA_ENCRYPTION_KEY_FILE=/CAMINHO_ABSOLUTO_FORA_DO_REPOSITORIO/gestor-prod-k1.keyring.json
DATA_ENCRYPTION_WRITE=true
DATA_ENCRYPTION_REQUIRED=true
DB_SSL=true
```

Definir também DB_HOST/PORT/NAME/USER/PASSWORD, SESSION_SECRET existente, proxy confiável e demais variáveis atuais. `DB_SSL_CA` aceita conteúdo PEM, inclusive `\n` escapado; **não é caminho de arquivo**. Não existe variável atual que habilite `ssl.verifyIdentity`; ver bloqueio na etapa 2. Usar o hostname coberto pelo certificado SQL.

Para a configuração exclusiva do processo de backup pré-ativação, usar a mesma origem SQL e keyring, mas `DATA_ENCRYPTION_WRITE=false` e `DATA_ENCRYPTION_REQUIRED=false`. Esse arquivo não deve ser aplicado ao serviço. Para migração, configurar `MIGRATION_ENVIRONMENT=production` e `LEGACY_SESSION_SECRET` pelo canal protegido quando existir integração legada; preservar a correspondência com o segredo que cifrou os dados, sem o alterar.

```powershell
# Configuração somente; sem conexão SQL nem mudança nos processos ativos.
npm run security:production -- --config "$prodConfig"

# Após autorização de leitura e TLS validado; autentica envelopes e conta legados.
npm run security:production -- --config "$prodConfig" --database
```

Falha por tabelas de segurança ausentes é inspeção incompleta, não justificativa para iniciar a aplicação e criar schema automaticamente. Registrar as ausências para a etapa 6. Exit 2 por registros legados antes da migração é esperado e deve ser explicado; exit 0 não libera infraestrutura.

**Riscos:** chave perdida, conta de serviço sem acesso, chave errada/legado errado, gravações concorrentes e envelope maior que a coluna. Não iniciar processos com novas gravações cifradas antes de preparar colunas e todos os leitores. Não ativar uma chave só em parte dos processos.

**Verificações:** recuperar cópia protegida do keyring por um segundo responsável; abrir dados/backup isolado com essa cópia; contar os quatro campos; identificar ilegíveis; preservar hashes bcrypt. Após ativação, conferir zero texto puro, zero integração legada, zero ilegível/não verificado; chave anterior legível é aceitável se planejada. Validar novas gravações e leitura por portal, mensagens e pagamentos em homologação.

**Rollback:** antes de gravar v2, restabelecer configuração anterior. Depois de gravar v2, manter leitor compatível e todas as chaves usadas; remover o keyring torna dados ilegíveis. A reversão transacional específica consta na etapa 8; ela não desfaz registros novos ou mudanças posteriores. Não reduzir colunas TEXT.

## 2. TLS do banco e infraestrutura

### Lacuna que precisa ser resolvida antes da liberação

A conferência do driver instalado mostrou que `mysql2/lib/base/connection.js` usa `ssl.verifyIdentity` para validar hostname; `connection_config.js` apenas torna `rejectUnauthorized` verdadeiro por padrão. Os objetos atuais em `src/config/env.ts`, migração, restauração e inspeção não definem `verifyIdentity`. Portanto, **`DB_SSL=true` e CA válida não bastam para atestar a identidade do hostname em todos os caminhos atuais**. A conexão de sessões herda o objeto SSL do ambiente.

Preparar, em mudança pequena separada, a exigência de identidade TLS nos caminhos existentes, sem recriar o transporte. Testar também o comportamento do driver com IP literal e SAN: a versão instalada condiciona a checagem ao nome DNS. Preferir hostname certificado e bloquear configurações sem garantia equivalente. Esta correção não foi implementada nesta tarefa de planejamento e impede atestar TLS completo da aplicação.

### Comandos futuros de inspeção

Cliente **Oracle MySQL 8.x**, de dentro do mesmo ambiente de rede da aplicação; `--login-path` é perfil protegido já configurado com prompt de senha, nunca senha no argumento:

```powershell
mysql --login-path=gestor-auditoria --ssl-mode=VERIFY_IDENTITY --ssl-ca="C:/segredos/db-ca.pem" --execute="SHOW SESSION STATUS LIKE 'Ssl_cipher'; SHOW SESSION STATUS LIKE 'Ssl_version'; SELECT VERSION(); SHOW GRANTS FOR CURRENT_USER;"
```

Para cliente MariaDB, usar as opções de sua versão, normalmente `--ssl --ssl-verify-server-cert --ssl-ca=...` com perfil/arquivo protegido, e os mesmos SELECTs. Não presumir compatibilidade de `--ssl-mode`. Conferir `mysql --version`/`mariadb --version` antes. Os grants podem conter nomes internos: guardar resultado restrito, sem publicar no relatório.

Cipher não vazio comprova criptografia **daquela conexão**, não das pools do backend, sessões, worker ou CLIs. Testar cada caminho com CA incorreta e hostname divergente no laboratório: todos devem falhar antes de SQL sensível. Não fazer ensaios de interceptação em produção. [Referência MySQL](https://dev.mysql.com/doc/refman/8.4/en/using-encrypted-connections.html).

Depois de autorizada inspeção do domínio:

```powershell
npm run security:tls -- --url https://DOMINIO_APROVADO
curl.exe --head --max-time 15 http://DOMINIO_APROVADO/
curl.exe --head --max-time 15 https://DOMINIO_APROVADO/login
```

Não usar `-k`. O CLI valida handshake público na porta 443, não a configuração completa de protocolos, redirecionamento ou certificado SQL. Verificar destino canônico de Location sem loops, HSTS/CSP/no-store, ausência de X-Powered-By e preservação de cabeçalhos pela CDN. Restringir inspeção a URLs autorizadas, sem sondar arquivos secretos publicamente.

Inventário somente de leitura no host Linux, se houver shell autorizado:

```sh
ss -lnt
df -h
systemctl status NOME_DA_UNIDADE_APROVADA --no-pager
```

No Windows: `Get-NetTCPConnection -State Listen`, `Get-NetFirewallProfile` e `Get-Service -Name NOME_APROVADO`. Na hospedagem compartilhada, coletar evidências equivalentes no painel; não presumir acesso root/systemd. Validar regras reais de entrada/saída, isolamento entre sites, sockets/ACLs, webroot, atualização de SO/runtime/SQL/proxy, conta SQL sem grants globais/FILE/SUPER/GRANT OPTION e identidade separada para migração. Não imprimir `systemctl show ... Environment` ou arquivos de proxy com segredos.

**Riscos:** queda de conexões por CA/hostname, bloqueio de tráfego legítimo, loop HTTPS e bypass do proxy. **Verificações:** login/cookies persistentes, pools/sessões/worker usando TLS e IP real vindo apenas de proxies confiáveis; backend e SQL não expostos à internet. **Rollback:** restaurar versão conhecida do proxy/regras/configuração após aprovação, preservando canal administrativo. Se TLS seguro não funcionar, abortar liberação; não usar `rejectUnauthorized=false` nem retornar a SQL remoto sem TLS como solução.

## 3. Backup real e restauração isolada

### Aquisição e proteção

Autorizar separadamente a leitura/cópia dos dados reais e sua guarda no laboratório. Preferir backup cifrado completo já existente e recente, acompanhado do keyring completo e hash registrado em canal protegido. A exportação JSON de `/minha-conta/backup` é por conta e **não substitui** backup integral. O arquivo de rollback de migração também **não é** backup integral.

Se não existir dump integral cifrado compatível, o comando abaixo reutiliza `gerarDumpSql` e `SecretVault` existentes para gerar um novo artefato, sem iniciar servidor, schema ou cron. Executar somente na origem autorizada, depois de validar o caminho TLS corrigido. A configuração de backup já deve ter keyring; o diretório de destino deve existir, ser privado e ter capacidade. A criação do arquivo é uma escrita operacional que requer autorização.

```powershell
$env:GESTOR_ENV_FILE = $backupConfig
@'
import fs from 'node:fs';
import { env } from './src/config/env.ts';
import { db } from './src/db/mysql.ts';
import { gerarDumpSql } from './src/services/backup.ts';
import { dataVault } from './src/security/storedSecrets.ts';
try {
  if (!dataVault) throw new Error();
  const sql = await gerarDumpSql();
  const context = `database-backup:${env.db.name}`;
  const payload = dataVault.seal(sql, context);
  if (dataVault.open(payload, context) !== sql) throw new Error();
  fs.writeFileSync(process.argv[2], JSON.stringify({version:2, sourceDatabase:env.db.name, payload}), {flag:'wx', mode:0o600});
  console.log('backup-cifrado-criado');
} catch {
  console.error('backup-nao-concluido'); process.exitCode = 1;
} finally { await db.end(); }
'@ | node --import tsx --input-type=module - "$fullBackup"
if ($LASTEXITCODE -ne 0) { throw 'Interromper: backup não concluído.' }
Get-FileHash -LiteralPath "$fullBackup" -Algorithm SHA256
Remove-Item Env:GESTOR_ENV_FILE
```

O dump exige InnoDB, ausência de DDL concorrente e memória suficiente. Não inclui uploads, arquivos de configuração, chaves, rotinas e usuários SQL; preparar suas cópias protegidas separadas. Conferir índices, engines e objetos extras antes de escolher esse formato. Backup de terceiros/SQL puro precisa de procedimento específico de importação, não é aceito diretamente por `security:restore`. Não reempacotar dump desconhecido e executá-lo como SQL confiável.

### Restauração

Preparar instância/schema **novos e vazios**, com usuário incapaz de acessar a origem ou outros schemas; não apenas declarar `MIGRATION_ENVIRONMENT=staging`. Bloquear egress para pagamentos, WhatsApp, e-mail, push, webhooks e cron real antes de carregar a cópia. Usar rede/host separados; manter chave/dados reais protegidos, sem enviar a terceiros. Não iniciar app/worker sobre essa cópia antes da etapa 6.

Configuração exclusiva: `MIGRATION_ENVIRONMENT=local` com loopback, ou `staging` com TLS validado; DB_NAME exclusivo; keyring capaz de abrir o backup e todos os campos históricos. APP_URL, cookies, SESSION_SECRET e credenciais de sandbox devem ser exclusivos da homologação quando iniciar a aplicação. `LEGACY_SESSION_SECRET` da origem pode ser necessário apenas no ensaio de migração, guardado separadamente.

```powershell
Measure-Command {
  npm run security:restore -- --config "$restoreConfig" --backup "$fullBackup"
  if ($LASTEXITCODE -ne 0) { throw 'Prévia de restauração falhou.' }
  npm run security:restore -- --config "$restoreConfig" --backup "$fullBackup" --apply
  if ($LASTEXITCODE -ne 0) { throw 'Restauração falhou.' }
}
npm run security:production -- --config "$restoreConfig" --database
```

O inspetor pode retornar exit 2 por configuração de laboratório/legados/tabelas ausentes; registrar motivo, não aceitar ilegíveis. O restaurador autentica envelope e exige banco vazio, mas executa SQL com múltiplas instruções; **não é sandbox nem validação de todo conteúdo SQL**. Usar apenas artefato de procedência conhecida. Falha durante DDL pode deixar destino parcialmente restaurado.

**Verificações:** comparar contagens por tabela e valores com manifesto obtido do mesmo snapshot (sem SELECTs produtivos de momentos diferentes); preservar hashes bcrypt; validar abertura de todos os segredos em ferramenta local sem imprimi-los; testar chaves anteriores. Conferir referências órfãs, por exemplo no destino:

```sql
SELECT COUNT(*) AS clientes_sem_dono
FROM clientes c LEFT JOIN users u ON u.id=c.user_id WHERE u.id IS NULL;
SELECT COUNT(*) AS pagamentos_sem_cliente
FROM pagamentos p LEFT JOIN clientes c ON c.id=p.cliente_id WHERE c.id IS NULL;
SELECT COUNT(*) AS pagamentos_dono_divergente
FROM pagamentos p JOIN clientes c ON c.id=p.cliente_id WHERE p.user_id<>c.user_id;
```

Reativar `FOREIGN_KEY_CHECKS` não valida retroativamente órfãos: revisar todas as FKs relevantes, não apenas os exemplos. Sessões e `auth_login_attempts` são excluídos intencionalmente do dump existente. Inventário SQL não prova bcrypt válido nem integridade de todos os dados.

Medir recuperação ponta a ponta: localizar cópia, recuperar chaves, transferir, restaurar, conferir, subir ambiente e reconciliar pagamentos. **RPO proposto ≤24 h, RTO proposto ≤4 h**, sujeitos a aprovação e volume real; backup diário no mesmo disco não atende perda total. Retenção proposta: 14 diários, 8 semanais, 12 mensais, cópia independente e ensaio mensal; sem expurgo automático até aprovação.

**Riscos:** exposição da cópia real, reenvio de cobranças/mensagens, backup incompleto e schema de destino indevido. **Rollback:** encerrar somente o laboratório novo e preservá-lo para diagnóstico, sem apagar a origem. Se restauração falhar, escolher outro schema vazio; não forçar sobre o parcialmente restaurado. Nenhum dado produtivo precisa ser revertido nesta etapa.

## 4. Autenticação dos webhooks de pagamento

### Estado conferido

`PaymentsController.webhook` encaminha somente provedor e `request.body`; não passa headers nem bytes originais ao workflow. `express.json()` já fez parse. A consulta ao provedor antes de atualizar status é uma proteção existente e deve ser preservada, mas **não autentica o emissor do POST**. O controller retorna 200 e o workflow captura erros; revisar confirmação de recebimento e retentativas para não perder eventos.

Não existe comando/variável que ative assinatura no código atual. Requer mudança restrita futura no ponto HTTP/validação, reaproveitando os workflows; nada foi implementado nesta preparação.

| Provedor | Revisão necessária e fonte oficial |
| --- | --- |
| Mercado Pago | Conferir `x-signature`, `x-request-id`, ID canônico e HMAC conforme produto; validar janela temporal e normalização exatamente como documentado. [Webhooks](https://www.mercadopago.com.br/developers/en/docs/links-and-debts/additional-content/your-integrations/notifications/webhooks). |
| Asaas | Validar token dedicado do header `asaas-access-token`, diferente da API key; comparação segura, por conta/endpoint. [Introdução](https://docs.asaas.com/docs/sobre-os-webhooks). |
| OpenPix/Woovi | Identificar modalidade vigente da integração e validar assinatura sobre bytes originais; não confundir HMAC-SHA1 legado com modalidade SHA-256. [Segurança](https://developers.openpix.com.br/docs/category/seguran%C3%A7a-1). |
| PagBank | Confirmar API/contrato de notificações usado. A documentação distingue modelo anterior `x-authenticity-token` e novo `x-payload-signature` com ECDSA/SHA-256; confirmar disponibilidade e endpoint produtivo do novo serviço com o provedor antes de adotar. [Autenticidade](https://developer.pagbank.com.br/reference/validacao-de-autenticidade). |
| Pagar.me | Identificar produto/versão efetiva; não aplicar assinatura de postback de outra versão. A documentação geral v5 consultada não resolve sozinha o mecanismo da conta; confirmar com suporte/documentação contratada e testar. [Visão geral](https://docs.pagar.me/reference/vis%C3%A3o-geral-sobre-webhooks). |

Os contratos são por provedor e podem mudar. Não criar uma validação genérica que aceite todos pelo mesmo algoritmo. Identificar quais estão ativos sem alterar configurações reais. Usar a conta/provedor do registro no servidor para selecionar segredo; ID/owner enviados pelo navegador ou webhook não concedem acesso a outra conta. Preservar raw body quando exigido, sem armazená-lo em logs.

Comandos de revisão/teste, executados apenas no checkout/laboratório:

```powershell
rg -n 'webhook|express.json|consultarPagamento' backend/src/payments src/config/http.ts src/services/paymentWorkflow.ts
npm run test:security:production
node --import tsx --test test/nest-payments.test.mts

# Somente após implementar a validação: ausência de assinatura deve ser rejeitada.
curl.exe --max-time 15 --request POST https://HOMOLOGACAO_AUTORIZADA/webhook/mercadopago --header "Content-Type: application/json" --data-raw '{"type":"payment","data":{"id":"ficticio"}}'
```

Os testes atuais não validam assinatura. Criar testes dirigidos futuros para assinatura ausente/inválida, bytes alterados, replay/duplicidade, evento fora de ordem, conta errada, rotação de segredo, falha do provedor e concorrência. Para testes positivos, gerar fixtures sintéticas locais ou usar envio sandbox oficial, sem colocar segredo no curl. Validar valor/moeda/recurso/conta no retorno do provedor e comprovar que não há dupla renovação, crédito ou mensagem.

**Riscos:** rejeitar notificações legítimas, confirmar eventos não autênticos, perder evento por 200 prematuro ou repetir efeitos financeiros. **Verificações:** homologação por provedor ativo; idempotência persistida; retentativa/reconciliação sem reexecutar cobrança; limites/timeouts na borda. IP allowlist é camada adicional, não substitui autenticidade.

**Rollback:** manter build conhecido com validação funcional e segredos anteriores durante janela compatível. Em falha, interromper expansão e reconciliar eventos com o provedor por procedimento aprovado; não desativar validação ou aceitar qualquer assinatura como rollback. Se o único build anterior não autentica callbacks, classificá-lo como retorno degradado que exige decisão explícita de risco; não liberar silenciosamente. Alterações no painel do provedor dependem de autorização específica.

## 5. Monitoramento e alertas automáticos

Reutilizar `security_events`, `/admin/security/events` e `security:production`. Separar: execução agendada, detecção, encaminhamento e confirmação humana. A tabela não é imutável; não contém eventos cuja persistência falhou. O CLI ainda autentica todos os campos a cada `--database`: medir custo antes de definir intervalo; em base grande, planejar consulta agregada leve reutilizando o módulo existente e inventário completo em janela separada.

```powershell
npm run security:production -- --config "$prodConfig" --database --backup-dir "C:/backups/gestor"
$monitorExit = $LASTEXITCODE
# 0 = sem achado automático; 2 = achado; 1 = monitor incompleto/falho.
# Tratar também ausência de execução; nenhuma dessas saídas libera produção.
```

Rascunho para cron Linux **somente se disponível**, a revisar/instalar por operação após aprovação. Não executar `crontab -` para sobrescrever tarefas existentes. Executar com usuário restrito, caminhos absolutos e diretório de logs privado já criado; `/opt/gestor` precisa ser a raiz real usada pela verificação de chave externa. O exemplo emite alerta no syslog local, sem enviar dados a terceiros:

```cron
*/15 * * * * cd /opt/gestor && /usr/bin/node --import tsx scripts/security-production.mts --config /srv/gestor-secrets/monitor.security.env --database --backup-dir /srv/gestor-backups >> /var/log/gestor/security-monitor.log 2>&1; code=$?; if [ "$code" -ne 0 ]; then /usr/bin/logger -p authpriv.alert -t gestor-security 'Inspecao de seguranca com alerta ou falha; consultar registro local protegido'; fi
```

Medir e evitar sobreposição de execuções, usando trava do agendador ou ferramenta disponível no host. A identidade SQL do monitor deve ter somente SELECT nas tabelas usadas; nunca executar o schema para "corrigir" o monitor. A configuração do monitor deve descrever a política real e ter acesso autorizado ao keyring; isso torna o usuário do monitor sensível. A pasta passada a `--backup-dir` deve corresponder à pasta efetiva `backups/` do cwd do serviço, não a um diretório arbitrário que só contenha cópias antigas.

Em Windows, usar Agendador de Tarefas com ação equivalente, usuário do serviço, cwd do projeto e regra de alerta para saída 1/2; exportar a tarefa aprovada antes de editar. Na hospedagem sem cron/scheduler adequado, escolher mecanismo suportado antes de liberar; não inventar unidade systemd.

Preparar regras para: qualquer rate limit/admin negado; ≥10 falhas de login ou escritas admin/15 min; exportações anormais; ≥5 erros críticos/min; disco <15%/<5%; backup ausente ou >26 h; certificado perto de vencer; ausência de execução do monitor por duas janelas. Capturar `request.failed`, `security.persistence_failed`, falhas do worker/backup/startup via stderr/log local, não apenas SQL. O CLI atual não implementa todas essas regras nem um canal de notificação.

**Verificações:** provocar eventos apenas sintéticos em homologação, simular SQL indisponível, diretório inexistente e monitor parado; confirmar detecção e chegada ao responsável em até 15 min para sinais urgentes. Syslog/log por si só não comprova entrega humana. Definir canal local/interno aprovado; não enviar payloads, tokens, credenciais ou dumps para serviços externos. Guardar logs com acesso restrito e arquivo separado protegido; proposta 30 dias consultáveis/180 dias arquivados, sem expurgo até aprovação.

**Riscos:** alerta sem destinatário, falha silenciosa, sobrecarga SQL/disco e log alterável. **Rollback:** restaurar versão anterior da tarefa/coletor e regras conhecidas, preservando logs e trilha; manter cobertura manual temporária aprovada. Não apagar eventos nem desabilitar integrações. Não liberar sem alerta automático testado e pessoa responsável.

## 6. Migrações na inicialização

### Achado adicional da leitura atual

`ensureDatabaseSchema()` não se limita a CREATE/ALTER. Também copia token legado para configuração de pagamento, define provedor padrão, cria/atualiza planos comerciais, pode inativar planos e atribui vencimento de trial a usuários sem valor. Parte dessas operações captura erro e continua. `createSessionStore()` usa `createDatabaseTable: true`. Revogar CREATE/ALTER da conta SQL sem revisar essas chamadas pode impedir a inicialização mesmo com tabelas existentes.

**Não iniciar `npm start` sobre a base real como forma de validar segurança.** Não existe hoje um CLI dedicado de schema nem variável `SKIP_MIGRATIONS` que resolva isso. `LOCAL_MODE=true` não é alternativa para produção: é recusado nesse modo e troca características operacionais.

Comandos de inspeção e levantamento do delta, antes de qualquer execução:

```powershell
rg -n 'ensureDatabaseSchema|CREATE|ALTER|INSERT|UPDATE|catch' backend/src/main.ts src/db/schema.ts src/db/sessionStore.ts src/db/cobrancasEnviosSchema.ts
```

```sql
SELECT TABLE_NAME, ENGINE FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME;
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE()
AND TABLE_NAME IN ('users','clientes','payment_provider_configs','security_events','security_rate_limits','auth_login_attempts');
```

Preparar mudança restrita de ciclo de vida, reaproveitando definições atuais: migração explícita por identidade própria, registro de versão/resultado, startup com verificação de compatibilidade e sem DML comercial implícito. Aprovar separadamente cada transformação comercial, não apenas DDL de segurança. Enquanto essa separação não estiver pronta, exigir delta completo por clone e aprovação de todas as operações de inicialização; a auditoria não considera um simples restart inofensivo.

O CLI de segredos existente também faz `ALTER TABLE clientes MODIFY senha TEXT NULL` e `ALTER TABLE users MODIFY mp_access_token TEXT NULL` antes da transação de valores. DDL pode confirmar fora da transação; o rollback de segredos não desfaz esses ALTERs. Em MySQL/MariaDB, testar duração/locks e compatibilidade na versão exata do host. Não anunciar atomicidade integral da migração.

**Verificações:** comparar clone antes/depois, inclusive provedor padrão, planos, preços, trial e credenciais; garantir que segredos não sejam copiados como texto puro; iniciar duas instâncias e verificar ausência de corrida; conferir que repetir startup não altera dados de negócio; criar sessões com conta operacional mínima e tabelas previamente aprovadas.

**Riscos:** alteração comercial não autorizada, lock de tabela, DDL parcial, concorrência entre processos e erro ignorado. **Rollback:** build compatível anterior, conservando colunas ampliadas/tabelas novas; reversão de DML apenas com valores anteriores e comparação de estado para preservar edições posteriores. Na falha estrutural, recuperar para outro banco e validar antes de troca aprovada; não executar DROP ou down migration genérica. **Sem delta e reversão ensaiados, não liberar.**

## 7. Homologação final

Usar mesma versão de SQL/runtime, proxy, TLS, usuário de serviço, cookies, sockets, build e configuração de segurança da futura produção, com bancos/contas/domínio próprios. Para testes de funcionalidades, anonimizar cópia em laboratório autorizado ou usar fixtures/sandbox; não alterar dados reais. Não conectar provedores reais para "testar mensagens".

**Cuidado com automações:** `backend/src/worker.ts` inicia cron sempre que `!env.localMode`; não consulta `RUN_AUTOMATIONS`. O supervisor inicia worker quando `LOCAL_MODE` não é true. Logo, `RUN_AUTOMATIONS=false` sozinho **não isola homologação com cópia real**. Manter bloqueio de egress e controlar processos até revisar esse comportamento e usar contas de sandbox. Não desativar integrações produtivas para criar esse isolamento.

```powershell
# No checkout/laboratório, sem variáveis produtivas herdadas.
npm run build
npm run test:security
npm run test:security:advanced
npm run test:security:production
npm test
npm run test:security:database
npm run test:security:csp
npm audit --omit=dev
npm audit

# Preparar config de stage com MIGRATION_ENVIRONMENT=staging e banco exclusivo.
npm run security:migrate -- --config "$stageConfig"
npm run security:migrate -- --config "$stageConfig" --apply --restore-tested --backup "C:/backups/homologacao-migracao-unica.enc"
npm run security:production -- --config "$stageConfig" --database --backup-dir "C:/backups/homologacao"

# Apenas após controle da inicialização e do worker, em homologação isolada.
$env:GESTOR_ENV_FILE = $stageConfig
npm start
```

O ensaio `test:security:database` usa MariaDB portátil no Windows e `test:security:csp` depende de Chrome no caminho configurado; verificar ferramentas disponíveis. Eles não substituem o banco/ambiente real de homologação. Não presumir instalação automática dessas ferramentas em Linux/CI.

**Aceite funcional:** login painel/portal, logout, expiração/revogação após mudança de papel; usuário comum bloqueado em admin; contas A/B e IDs manipulados em leitura/escrita/exportação/pagamento/integração; CSRF, XSS/CSP via navegador e headers finais; gravações cifradas em todos os campos previstos; leitura de chave antiga; webhooks assinados, duplicados e fora de ordem; recuperação real; monitor/alerta e perda de heartbeat; restart aprovado sem DML comercial novo; rollback do build e migração ensaiados.

Os testes de navegador legados não são prova de ambiente remoto: verificar qual alvo/fixture cada script inicia antes de apontá-lo a uma URL. Registrar artefato, configuração sem segredos, data, executor, evidência e resultado; testar caminhos negativos sem pagamentos reais.

**Riscos:** homologação misturada à produção, saída para provedores, diferença de versões e falsa confiança em testes locais. **Rollback:** voltar build/configuração do laboratório ou restaurar para outro schema vazio; preservar produção. Falha em critério obrigatório bloqueia publicação; não resolver alterando dados reais.

## 8. Janela aprovada de ativação e rollback de produção

Esta seção **não foi executada**. Exige autorização explícita para cada escopo: backup/leitura, contenção temporária de escritas, migração de schema/dados, configuração, publicação/reinício e retomada. Não desligar integrações; coordenar manutenção e retentativas de callbacks com operação/provedores. Esvaziar transações em curso e controlar produtores de escrita, inclusive worker/cron, somente com aprovação.

1. Conferir destino, hash do build, janela, contatos e evidências das etapas anteriores. Confirmar que todos os leitores entendem v2 e que nenhum processo antigo voltará a gravar legado.
2. Gerar backup integral novo, conferir hash/cópia independente e disponibilidade das chaves. Usar nomes únicos; backup diário existente do mesmo dia pode ser anterior à janela.
3. Aplicar apenas delta de schema/negócio explicitamente aprovado, conforme procedimento ensaiado da etapa 6. Validar colunas e registrar resultados antes da criptografia.
4. Executar simulação e migração abaixo. Configuração produtiva do CLI deve conter `MIGRATION_ENVIRONMENT=production`; nunca falsificar `staging` para contornar a trava.

```powershell
# LEITURA DO ALVO REAL: somente após autorização, com TLS corrigido.
npm run security:migrate -- --config "$prodConfig" --approve-production
if ($LASTEXITCODE -ne 0) { throw 'Interromper: simulação falhou.' }

# ESCRITA REAL + DDL: somente na janela explicitamente aprovada.
npm run security:migrate -- --config "$prodConfig" --approve-production --apply --restore-tested --backup "$migrationBackup"
if ($LASTEXITCODE -ne 0) { throw 'Interromper: migração não concluída; avaliar DDL e estado antes de retentar.' }
```

`--restore-tested` é declaração do operador: o CLI não comprova que a restauração aconteceu. Se houver conflito, reavaliar plano e gerar nome novo de backup; não forçar sobrescrita. A simulação recifra em memória e percorre dados, portanto planejar memória/tempo.

5. Aplicar configuração de gravação cifrada obrigatória em todos os processos; publicar o build aprovado e reiniciar pelo mecanismo **específico do host**, previamente ensaiado. Não há comando universal seguro de restart/deploy neste projeto; registrar o comando exato ou a ação do painel e a reversão antes de autorizar. Não usar `npm start` como substituto automático de restart gerenciado.
6. Validar `/healthz`, login/cookie, consultas por dono, inventário criptográfico e alerta. Não gerar cobrança nem mudar senha real no smoke test sem autorização específica. Reconciliar callbacks recebidos na janela e retomar produtores conforme aprovação; conferir que não houve reenvio duplicado.

```powershell
npm run security:production -- --config "$prodConfig" --database --backup-dir "C:/CAMINHO_REAL/backups"
curl.exe --fail --silent --show-error --max-time 15 https://DOMINIO_APROVADO/healthz
```

### Reversão, se necessária

Priorizar retorno ao build conhecido **compatível com v2**, com keyring completo e configurações seguras. Não retirar chaves, reduzir colunas, restaurar banco sobre o ocupado ou reabrir TLS inseguro. Mudanças de schema e DML comercial exigem seu plano próprio; o backup de segredos não os cobre.

Se aprovado desfazer **somente os valores capturados na migração**, simular e aplicar comparação estrita de estado:

```powershell
npm run security:migrate -- --config "$prodConfig" --approve-production --rollback "$migrationBackup"
if ($LASTEXITCODE -ne 0) { throw 'Rollback não seguro: investigar sem forçar.' }
npm run security:migrate -- --config "$prodConfig" --approve-production --rollback "$migrationBackup" --apply
```

Conflito cancela transação de valores; não apaga edições posteriores e não oferece opção de forçar. A reversão de valores pode reintroduzir texto puro: exige aceitação explícita e não torna seguro publicar leitor antigo se houver registros v2 novos fora desse backup. Preferir corrigir configuração/leitor mantendo criptografia. Uma restauração integral de contingência deve ocorrer em banco novo, com verificação e aprovação separadas para troca de destino, aceitando/reconciliando perdas dentro do RPO aprovado.

Abortar avanço diante de segredo ilegível, ausência de backup recuperável, TLS sem identidade, mudança comercial não prevista, acesso entre contas, eventos financeiros duplicados, alerta não entregue ou erro crítico persistente. Observar métricas continuamente na janela e por 24 h após a liberação; não classificar sucesso apenas pelo health check.

## Checklist final de liberação

Legenda: **PRONTO** = implementação/evidência local registrada; **CONFIGURAR** = decisão ou preparação operacional; **BLOQUEIA** = evidência/correção obrigatória ainda ausente. Uma mesma área pode ter código pronto e ativação bloqueada.

| Estado | Item | Evidência para encerrar |
| --- | --- | --- |
| PRONTO | Autenticação, sessões, guards, CSRF, CSP e isolamento dos caminhos testados | Código e testes das etapas 1.0–3.0; repetir para release |
| PRONTO | AES-GCM/keyring/rotação e CLIs de migração/restauração | Ensaios com dados fictícios; não equivalem à ativação real |
| PRONTO | Snapshot de backup e exportação por dono com auditoria | Correções e ensaios 3.0 |
| PRONTO | Inspetor e sinais de segurança | CLI local; sem comprovação de entrega automática |
| CONFIGURAR | Host, responsáveis, janela e mecanismo exato de deploy/restart | Registro aprovado, contatos e comandos próprios do host |
| CONFIGURAR | ACLs, cópia independente de chaves e retenção de backups/logs | Usuário de serviço testado, custodiante e política aprovada |
| CONFIGURAR | RPO ≤24 h/RTO ≤4 h ou objetivos ajustados | Aprovação do negócio e medição ponta a ponta |
| CONFIGURAR | Monitor/scheduler/canal interno e plantão | Configuração aprovada, proteção dos registros e heartbeat |
| BLOQUEIA | Keyring e criptografia dos dados reais ainda não comprovados | Migração aprovada, inventário sem legados/ilegíveis e gravações novas cifradas |
| BLOQUEIA | TLS remoto completo, inclusive hostname nos caminhos da aplicação/CLIs | Ajuste restrito de `verifyIdentity` e testes negativos/positivos por conexão |
| BLOQUEIA | Hospedagem, proxy, firewall, SQL mínimo e arquivos privados sem evidência real | Inspeção autorizada e configurações finais comprovadas |
| BLOQUEIA | Restauração de backup real e recuperação das chaves não executadas | Relatório de integridade e recuperação isolada dentro dos objetivos |
| BLOQUEIA | Autenticação dos webhooks ativos não validada | Contrato por provedor, validação, testes de repetição e reconciliação |
| BLOQUEIA | DDL/DML de startup e criação de tabela de sessões sem delta/controlabilidade aprovados | Migração explícita/revisão de efeitos e reversão ensaiada |
| BLOQUEIA | Worker pode disparar automações em cópia real apesar de RUN_AUTOMATIONS=false | Isolamento efetivo e ciclo de vida ensaiado antes de subir homologação |
| BLOQUEIA | Alertas automáticos e falha do monitor sem teste de entrega | Agendamento ativo no alvo, destinatário e teste positivo/negativo |
| BLOQUEIA | Homologação com topologia produtiva e rollback final pendentes | Evidências por requisito e assinatura do responsável pela liberação |
| BLOQUEIA | Falta de autorização explícita para executar a janela produtiva | Aprovação informada do alvo, escopo e procedimentos concretos |

MFA e recuperação de senha permanecem sem ativação por decisão anterior do responsável; não são reimplementados neste plano. Registrar aceitação do risco administrativo residual antes da liberação, sem apresentá-los como proteções prontas. Também permanecem limitações conhecidas de uploads e estilos inline, conforme os relatórios anteriores.
