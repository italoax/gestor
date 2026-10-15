# Banco de dados Hostinger — ajuste posterior à Segurança 3.1

> Evidência posterior: o [diagnóstico TLS autorizado de 15/10/2026](SECURITY-DATABASE-TLS-DIAGNOSTIC.md) validou cadeia e hostname de `srv1182.hstgr.io:3306` a partir do computador local. Isso permite preparar TLS remoto sem exceção local; a configuração e o runtime da hospedagem ainda precisam de validação autorizada. O restante deste documento registra as pendências existentes antes desse ensaio.

## Parecer e alcance

**Implantação permanece bloqueada.** A configuração documentada pelo suporte, `localhost:3306`, sem TLS confirmado, não é aceita pela política padrão de produção. O suporte a uma exceção TCP local foi preparado, mas **nenhum ambiente está autorizado no código entregue**. Alterar apenas o `.env` não desbloqueia essa conexão.

As informações da Hostinger são as respostas fornecidas pelo responsável nesta conversa. Não foram verificadas na conta da hospedagem. Nesta revisão não houve acesso à produção ou a bancos reais, alteração de credenciais, migração real, cobrança, envio de mensagem, publicação ou alteração de rede. A ocorrência histórica descrita em [SECURITY-FINAL-FIXES.md](SECURITY-FINAL-FIXES.md) permanece registrada naquele relatório.

TCP em loopback não oferece criptografia. A exceção depende de aceitação expressa desse risco e de evidência de isolamento, não apenas do nome `localhost`. O certificado HTTPS de `ixstreaming.com.br` não comprova TLS do MariaDB. Não foi introduzido `socketPath` para SQL.

## Política implementada

| Caminho | Comportamento |
| --- | --- |
| Backend, worker e sessões | Recebem host, porta e SSL da mesma fábrica em `src/config/env.ts` |
| Migração de schema/segredos, restauração e inspeção | Usam diretamente `databaseConnection()`; não substituem seu destino |
| Banco remoto, inclusive em desenvolvimento | TLS obrigatório, cadeia validada, hostname DNS validado e TLS mínimo 1.2 |
| Produção, inclusive loopback, política padrão | TLS obrigatório |
| Laboratório não produtivo em loopback | TCP sem TLS permitido, sem resolver `localhost` por DNS |
| Exceção Hostinger solicitada | Negada enquanto não existir aprovação compilada válida e identidade operacional correspondente |

Endereços IP literais não são aceitos para TLS: o caminho atual do mysql2 não oferece a mesma checagem de identidade para esses destinos. É necessário hostname coberto pelo certificado. Não existe opção para desabilitar `rejectUnauthorized` ou `verifyIdentity`. URLs SQL alternativas e variáveis de socket SQL são recusadas. Nomes remotos disfarçados de localhost não recebem exceção.

Na exceção, `DB_HOST` deve ser exatamente `localhost`, a porta deve ser 3306 e `DB_SSL=false` deve ser explícito. A conexão efetiva é fixada em **127.0.0.1:3306**, sem resolução de nomes. Isso exige confirmar que o serviço documentado funciona também pelo loopback IPv4; não presumir equivalência operacional com socket ou IPv6.

`src/security/localDatabaseDeployments.ts` contém um registro vazio de aprovações. Um registro futuro precisa ser revisado e incluído no artefato, nunca carregado do ambiente ou de JSON externo. A verificação compara hostname do sistema operacional, UID/GID reais e efetivos não privilegiados, caminho canônico da release, namespace de rede Linux, validade e referência da aprovação. Exige confirmação registrada de banco no mesmo host, isolamento entre clientes, acesso SQL restrito e ausência de encaminhamento/túnel.

Essas verificações vinculam a execução a uma topologia previamente aprovada; **não são atestação independente do provedor**, nem resistem a um invasor que já possa alterar código ou controlar o host. O padrão de diretório aceito corresponde às releases informadas, `/home/<usuario>/domains/ixstreaming.com.br/hbuilds/versions/<release>/nodejs`. Outro layout requer revisão, sem flexibilização automática. Mudança de host, namespace, identidade, layout ou expiração bloqueia novas inicializações; planejar renovação para evitar indisponibilidade.

## Evidências ainda necessárias

- Confirmação escrita da Hostinger de que o processo Node e o listener MariaDB estão no mesmo host/namespace de rede e de que 127.0.0.1:3306 atende essa aplicação sem proxy, túnel ou encaminhamento remoto.
- Modelo de isolamento entre sites/clientes, identidades dos processos e proteção contra acesso de outros usuários ao transporte e às credenciais. Loopback compartilhado não é controle de autorização SQL.
- Controles efetivos do listener e de acesso remoto, regras de origem e grants mínimos da conta SQL. A informação anterior de acesso remoto aberto a qualquer IP exige correção operacional aprovada; este trabalho não alterou regras.
- Disponibilidade real de TLS, CA e hostname certificado. Se disponível, preferir TLS validado à exceção. Não há caminho/permissões de socket Unix confirmados.
- Identidade operacional coletada pelo responsável, aprovação de risco, validade e referência das evidências. Nenhum valor real foi inventado ou incluído no registro.

Se a Hostinger não fornecer evidências suficientes, manter o bloqueio e escolher um serviço SQL com TLS verificável. Não usar `NODE_ENV=development`, `LOCAL_MODE=true` ou troca de hostname para contornar a política produtiva.

## Procedimento futuro de homologação e implantação

**Os comandos operacionais abaixo não foram executados.** Exigem autorização do alvo e do escopo. Não exportar o ambiente completo nem imprimir arquivos de segredos.

1. Obter as evidências acima e definir responsável, janela, artefato anterior compatível com criptografia v2 e procedimento do painel Hostinger para retorno. Inspeção da conta, SQL e rede continua dependendo de autorização.
2. Caso seja aprovada uma inspeção de identidade no host, executar na raiz canônica da release, sem importar a aplicação ou abrir SQL:

   ```sh
   node --input-type=module -e 'import os from "node:os"; import fs from "node:fs"; console.log(JSON.stringify({hostname:os.hostname(),uid:process.getuid(),effectiveUid:process.geteuid(),gid:process.getgid(),effectiveGid:process.getegid(),applicationRoot:fs.realpathSync(process.cwd()),networkNamespace:fs.readlinkSync("/proc/self/ns/net")}))'
   ```

   Guardar o resultado em registro operacional restrito. Identidade local não substitui as confirmações de isolamento e transporte do provedor.
3. Escolher um único transporte. Para TLS confirmado, configuração protegida:

   ```dotenv
   NODE_ENV=production
   DB_TRANSPORT=tls
   DB_HOST=HOSTNAME_COBERTO_PELO_CERTIFICADO
   DB_PORT=3306
   DB_SSL=true
   ```

   Configurar `DB_SSL_CA` com conteúdo PEM quando a CA não estiver no conjunto confiável do runtime; não usar caminho como valor nem desativar validação. Manter as credenciais existentes fora do repositório.
4. Somente se a exceção for expressamente aprovada após revisão das evidências, preencher o registro compilado, revisar o diff e produzir outro artefato. A configuração correspondente será:

   ```dotenv
   NODE_ENV=production
   DB_TRANSPORT=hostinger-local-tcp
   DB_HOST=localhost
   DB_PORT=3306
   DB_SSL=false
   RUN_AUTOMATIONS=false
   ```

   Esse exemplo permanece bloqueado no código atual. Remover `DB_SSL_CA` apenas nessa configuração de exceção. Não alterar senha, segredo de sessão ou chaves de dados. A configuração de homologação deve ter banco/credenciais próprios e egress bloqueado; nunca copiar essas instruções para um serviço ativo sem aprovação.
5. No checkout local sem credenciais reais, validar o artefato:

   ```powershell
   npm run check
   npm run test:security:hosting
   npm run test:security:31
   npm test
   npm run test:security:database
   ```

   As suítes npm usam um launcher que remove variáveis de aplicação herdadas e seleciona arquivo de configuração vazio com credenciais fictícias. O ensaio MariaDB exige as ferramentas portáteis previstas em `scripts/security-local-db.mts`; não instala serviço. Não executar testes antigos diretamente com `.env` real.
6. Em homologação isolada, reproduzir versão SQL/runtime e topologia, comprovar conexão positiva, recusas de identidade e transporte, sessões, isolamento por dono, criptografia, backup/restauração e automações desativadas. Não simular certificado inválido contra produção.
7. Após autorização de leitura, executar a inspeção com configuração explícita aprovada:

   ```powershell
   npm run security:production -- --config "CAMINHO_ABSOLUTO_CONFIG_APROVADA"
   # Somente com autorização adicional para leitura SQL do destino conferido:
   npm run security:production -- --config "CAMINHO_ABSOLUTO_CONFIG_APROVADA" --database
   ```

   A primeira forma não abre SQL. Pode encontrar outros bloqueios além do transporte. Saída 0 não comprova isolamento da hospedagem nem libera produção.
8. Seguir as migrações explícitas e o checklist de [SECURITY-FINAL-FIXES.md](SECURITY-FINAL-FIXES.md). Preparar backup recuperável, monitoramento e reversão antes de solicitar aprovação da publicação/reinício no painel. Não iniciar a aplicação para criar tabelas. Não há publicação, reinício ou alteração de acesso remoto autorizados nesta entrega.

## Riscos, verificação e rollback

| Risco | Verificação antes de publicar | Reversão segura |
| --- | --- | --- |
| TLS indisponível ou identidade divergente | Certificado, CA e hostname corretos; todos os caminhos SQL testados | Abortar avanço; manter configuração conhecida segura, sem desligar validação |
| Evidência local incompleta ou identidade expirada | Revisão do provedor e correspondência do registro compilado | Não ativar exceção; renovar aprovação só após nova evidência |
| Mudança de host/namespace/layout após redeploy | Conferir identidade da release antes de iniciar | Retornar ao artefato/configuração aprovados no host compatível; não aceitar qualquer host |
| TCP em claro e acesso entre clientes | Aceitação de risco e controles documentados de isolamento/SQL | Preferir TLS; revogar aprovação local em nova release se evidência deixar de valer |
| Build/configuração incompatíveis | Ensaio de retorno, leitor v2 e keyring completo | Restaurar build e configuração preservados pelo painel, com aprovação de reinício |

Não usar o retorno ao código antigo sem validação como rollback automático. Não alterar bancos, reduzir colunas, remover chaves, restaurar sobre banco ocupado ou apagar logs. Esta mudança não migra dados; sua reversão é de código/configuração. Credenciais e dados permanecem preservados. Se não houver destino compatível com transporte aprovado, interromper a liberação em vez de enfraquecer a política.

## Arquivos e validação local

Alterados: `src/security/databaseTls.ts`, `src/config/env.ts`, os CLIs `migrate-schema.mts`, `migrate-secrets.mts`, `restore-backup.mts`, `security-production.mts`, o ensaio `security-local-db.mts` e scripts npm em `package.json`. Adicionados: política e registro `src/security/localDatabasePolicy.ts`/`localDatabaseDeployments.ts`, `scripts/security-hosting.test.mts`, `scripts/run-isolated-tests.mts` e este relatório. O plano de implantação aponta para esta atualização.

Resultados desta revisão:

- `npm run check`: tipagem, builds backend/React/navegador e 27 templates EJS aprovados.
- Regressão conjunta das quatro suítes de segurança, nova suíte de hospedagem e `test/*.test.mts`: **281 aprovados, zero falhas**. Log local ignorado: `.tmp-ui/security-hosting-regression.log`.
- Nova suíte de hospedagem: **7 testes**, com aprovação sintética, recusa de identidade divergente, aprovação vencida/incompleta, aliases, destinos remotos, sockets/URLs e configurações inválidas. O registro real permanece vazio.
- `npm run test:security:database`: MariaDB temporário com dados fictícios, TCP em loopback, TLS válido, CA incorreta e hostname incorreto; migrações, concorrência, criptografia e restauração aprovados. Log local ignorado: `.tmp-ui/security-hosting-db.log`.

Esses resultados não comprovam o transporte nem o isolamento da Hostinger. Não foram repetidas inspeções de infraestrutura, auditoria npm ou testes externos nesta revisão.

## Checklist de liberação

- [x] Política central aplicada à pool, sessões e quatro CLIs SQL.
- [x] TLS remoto estrito e destino local literal sem resolução manipulável.
- [x] Exceção condicionada a aprovação compilada e identidade operacional; nenhuma aprovação ativa.
- [x] Testes locais e regressão aprovados com dados fictícios e ambiente de teste isolado.
- [ ] Confirmar suporte real a TLS e/ou evidências suficientes para exceção local.
- [ ] Confirmar loopback IPv4, topologia, isolamento, grants e restrição de acesso remoto.
- [ ] Aprovar risco e cadastrar identidade/validade apenas se a exceção for justificada.
- [ ] Homologar no ambiente autorizado e ensaiar rollback do painel Hostinger.
- [ ] Concluir criptografia real, restauração real isolada, webhooks pendentes e alertas do checklist 3.1.
- [ ] Obter autorização explícita para qualquer leitura real, alteração, publicação ou reinício.

**Produção não liberada.** Nenhuma operação produtiva foi executada nesta revisão.
