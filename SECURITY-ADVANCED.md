# Segurança avançada 2.0 — 15/10/2026

## Estado da entrega

Implementação local sobre a revisão anterior. Nenhuma alteração na hospedagem, nas senhas de usuários, nas credenciais reais, nos dados de produção ou nas regras de firewall. MFA e recuperação de senha continuam sem ativação.

A criptografia foi exercitada em um MariaDB temporário, com chaves aleatórias e dados fictícios. **A configuração corrente continua sem keyring de dados: dados reais não foram migrados nem passaram a ser cifrados automaticamente.** A ativação descrita abaixo é uma etapa operacional explícita. O código continua lendo os formatos antigos para preservar o sistema durante o rollout.

## Proteções implementadas

| Área                      | Alteração                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dados em repouso          | AES-256-GCM, IV aleatório de 96 bits, tag de 128 bits, formato `gestor:v2:<key-id>:...`, chave independente do segredo de sessão. O contexto autenticado inclui finalidade e conta.                                                                                                                                                        |
| Campos protegidos         | `clientes.senha`, `payment_provider_configs.credenciais`, `integracoes.senha_enc` e o token legado `users.mp_access_token`. As senhas de login com bcrypt não fazem parte da migração.                                                                                                                                                     |
| Compatibilidade           | O portal compara a senha IPTV recuperada; mensagens recuperam a senha somente no servidor; provedores recebem o mesmo JSON de credenciais; integrações Sigma antigas continuam legíveis com a chave legada. A representação cifrada não muda o valor da senha ou a revisão do portal.                                                      |
| Chaves                    | Keyring por arquivo externo ou variável, chave ativa e chaves antigas para leitura, geração sem imprimir material secreto e rotação preservando as chaves anteriores. Arquivo novo não sobrescreve um existente. No Windows, o gerador restringe a ACL ao usuário atual e SYSTEM; em POSIX solicita modo 0600.                             |
| Migração e rollback       | Simulação por padrão; configuração de ambiente explícita; backup cifrado obrigatório antes da gravação; comparação binária dos valores anteriores; uma transação para as alterações; conflito cancela tudo. O rollback também verifica o estado esperado para não sobrescrever modificações posteriores.                                   |
| Backups                   | Com keyring configurado, os novos dumps diários são cifrados e verificados por recuperação em memória antes de salvar. O comando de restauração só aceita ambiente local/homologação e banco vazio. Backups existentes são preservados; a limpeza automática anterior foi retirada desta etapa por exigência de preservação de dados.      |
| Automação abusiva         | Contadores de origem e endpoints sensíveis compartilhados em MySQL em produção. Contador por conta continua compartilhado. As janelas expiram e tentativas bloqueadas não prolongam o prazo indefinidamente. Falhas do armazenamento não liberam requisições.                                                                              |
| Sessões                   | Administradores têm 15 minutos de inatividade e máximo de 8 horas, inclusive com “lembrar de mim”. Contas comuns mantêm a política anterior. `session_version` permite revogar todos os acessos sem alterar senhas.                                                                                                                        |
| Confirmação de identidade | Minha Conta inclui confirmação de senha e encerramento de todas as sessões. A confirmação regenera o ID, registra autenticação recente e preserva o início da sessão para não estender o limite absoluto. Escritas em integrações, pagamentos, PIX, acessos de clientes, administração e exportação de backup exigem autenticação recente. |
| Proxy                     | Proxies confiáveis por endereço/CIDR, não por quantidade fixa de saltos. Cabeçalhos externos são normalizados no servidor público; a origem encaminhada ao Next tem assinatura interna. Cabeçalhos sem assinatura válida não definem a origem no Proxy Next. Transporte por socket local continua suportado.                               |
| Proxy de backend          | Caminhos absolutos recebidos não podem substituir o destino interno por um servidor externo. Teste HTTP comprova que um host externo não recebe requisição nem cookie.                                                                                                                                                                     |
| CSP                       | Scripts inline exigem nonce por resposta e handlers HTML inline são bloqueados. Next e EJS foram adaptados. A restauração antecipada de tema mantém nonce. `unsafe-inline` permanece somente em estilos, por compatibilidade com estilos React e templates.                                                                                |
| Dependências externas     | Chart.js continua na mesma versão 4.4.1, servido localmente; mapas usam os pacotes já instalados e são empacotados localmente. O dashboard não precisa buscar esses scripts em CDN. `proxy-addr` é fixado em 2.0.8, versão sem o alerta de spoofing reportado pelo audit para 2.0.7.                                                       |
| Exposição no frontend     | Limpeza de campos sensíveis também em acessos adicionais e JSON aninhado. Falhas internas ao gerar ou consultar pagamentos não devolvem mensagens cruas de banco/provedor.                                                                                                                                                                 |
| Eventos e alertas         | Persistência em `security_events`, metadados permitidos, origem derivada por HMAC, sem senha, token, corpo de requisição ou user-agent. Limites excedidos, acesso administrativo negado, mudanças de credenciais e revogações geram eventos; eventos relevantes têm severidade `alert`.                                                    |
| Diagnóstico               | Erros tratados usam nome/código de uma lista permitida, sem SQL, stack crua, respostas de provedor ou dados descriptografados. Falhas de persistência dos eventos geram alerta local genérico.                                                                                                                                             |

O feed interno fica em `GET /admin/security/events`, exige permissão administrativa atual e autenticação recente, retorna no máximo 100 eventos e separa os alertas. Não há envio externo de e-mail, Slack, WhatsApp ou mensagens a terceiros. O feed não é uma trilha imutável e não configura sozinho um serviço de plantão.

## Componentes principais

- Criptografia: `src/security/secretVault.ts`, `storedSecrets.ts`, `secretMigration.ts`; integração com `src/services/crypto.ts`, `paymentProvider.ts`, `whatsapp.ts`, `clientMutations.ts`, portal e integrações.
- Contadores e monitoramento: `src/security/sharedRateStore.ts`, `securityEvents.ts`, `runtimeSecurity.ts`, `safeError.ts`, `src/middleware/rateLimits.ts` e rotas nativas.
- Sessões: `src/security/accountSessions.ts`, `src/services/sessionSecurity.ts`, middleware de sessão, autorização e autenticação recente, login Nest e formulários Minha Conta.
- Frontend e transporte: `src/security/contentSecurityPolicy.ts`, `proxyTrust.ts`, `web/proxy.ts`, layout Next, adaptação das páginas legadas, servidor público e transporte do backend. Templates EJS receberam nonce e handlers declarativos.
- Operação: `scripts/security-keys.mts`, `migrate-secrets.mts`, `restore-backup.mts`, `security-inspect.mts`, `security-tls.mts`.
- Verificação: `scripts/security-advanced.test.mts`, `security-csp.browser.mts`, `security-local-db.mts` e o processo auxiliar de compatibilidade com dados cifrados.

O schema inclui `users.session_version`, `security_rate_limits` e `security_events`. Para suportar os envelopes cifrados, a ativação com keyring expande `clientes.senha` e `users.mp_access_token` para TEXT quando necessário. Essa expansão não apaga valores. Não reduza novamente as colunas no rollback.

## Ensaio executado em banco real isolado

Foi baixada uma distribuição portátil oficial MariaDB 11.8.3 para a pasta ignorada `.tmp-ui`, com SHA-256 conferido. O processo temporário usou exclusivamente `127.0.0.1`, porta própria, diretório de dados próprio, senha de root aleatória e schemas exclusivos. Não foi instalado serviço Windows. O processo foi encerrado ao final; nenhum banco configurado no `.env` da aplicação foi usado pelo ensaio.

Sequência validada:

1. Criar duas contas fictícias, senhas IPTV, um token de pagamento e uma integração no formato antigo.
2. Gerar backup SQL cifrado e restaurá-lo em outro schema vazio **antes da primeira migração**; comparar a senha IPTV e o hash de login restaurados.
3. Recusar restauração em um destino que já possui tabelas.
4. Executar a simulação e a migração real pelo CLI, com backup cifrado de rollback.
5. Ler as credenciais pelos adaptadores reais, autenticar no portal e montar uma mensagem; nenhum provedor ou WhatsApp externo foi chamado.
6. Confirmar isolamento do segredo por conta e idempotência da migração.
7. Executar rollback pelo CLI e comparar os valores anteriores, sem alterar hashes de login.
8. Migrar novamente, rotacionar a chave e recuperar o mesmo valor com o keyring; recusar chave ausente.
9. Simular alteração concorrente e comprovar rollback transacional sem restauração parcial.
10. Verificar contadores compartilhados usando duas conexões SQL, recriação do store, expiração, limite por conta e alerta administrativo persistido.

O teste foi em **MariaDB 11.8.3**, não em MySQL real nem na versão específica da hospedagem. Essa versão portátil é ferramenta de ensaio local, não uma indicação de versão para produção.

## Ativação em homologação

### 1. Separar configuração, chaves e banco

Use um arquivo exclusivo de homologação; a aplicação aceita `GESTOR_ENV_FILE` para selecionar o dotenv. Os CLIs de migração/restauração **não usam automaticamente o `.env` da aplicação**: exigem `--config`. Não copie credenciais para o chat, para o Git ou para o diretório público.

Gere a primeira chave em um diretório protegido fora do repositório e do banco:

```powershell
npm run security:keys -- --file "C:/segredos/gestor-first.keyring.json" --id first
```

O diretório deve existir. O comando imprime somente metadados. Guarde uma cópia protegida do keyring separadamente dos backups. Perder uma chave usada torna os registros e backups correspondentes irrecuperáveis; a senha de sessão não recupera dados v2.

Configure explicitamente, no ambiente autorizado:

```dotenv
DATA_ENCRYPTION_KEY_FILE=C:/segredos/gestor-first.keyring.json
DATA_ENCRYPTION_ACTIVE_KEY=first
DATA_ENCRYPTION_WRITE=true
DATA_ENCRYPTION_REQUIRED=true
```

Sem keyring, a compatibilidade legada é preservada e os novos campos IPTV/pagamento continuam no formato anterior. Para uma implantação que exige proteção, `DATA_ENCRYPTION_REQUIRED=true` faz a ausência/inconsistência da configuração impedir a inicialização. `DATA_ENCRYPTION_WRITE=false` é opção de transição com keyring mantido para leitura; não pode ser combinada com `REQUIRED=true`.

### 2. Validar recuperação no ambiente escolhido

Execute `npm run test:security:database` no ambiente local preparado. Em outra máquina, informe `MARIADB_TEST_BIN` com a distribuição portátil autorizada. O runner atual foi preparado para Windows; não baixa nem instala um serviço automaticamente.

Antes de migrar dados reais, restaure **um backup desse ambiente** em um banco vazio separado e valide contagens, credenciais e operações necessárias. O teste com dados fictícios não substitui esse ensaio. `--restore-tested` é uma declaração do operador de que o ensaio foi feito, não uma certificação automática sobre outro ambiente.

### 3. Simular e aplicar

O arquivo passado em `--config` precisa definir `MIGRATION_ENVIRONMENT=local` ou `staging`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` e o keyring. Para integrações antigas, fornecer `LEGACY_SESSION_SECRET` de forma protegida. Não altere esse segredo antes de recuperar e migrar o legado. Bancos remotos exigem `DB_SSL=true`, com `DB_SSL_CA` quando necessário; a verificação de certificado não é desativada.

```powershell
npm run security:migrate -- --config "C:/segredos/homologacao.security.env"
npm run security:migrate -- --config "C:/segredos/homologacao.security.env" --apply --restore-tested --backup "C:/backups/gestor-migration.enc"
```

A primeira execução apenas planeja e verifica recuperação em memória. A segunda cria um arquivo novo de backup, expande capacidade dos campos e aplica os valores em transação. Colisões no nome do backup, chave faltando, conflito de registro ou falha de autenticação do envelope interrompem a operação. O comando não altera senha de login, usuário, status de provedor ou a capacidade de usar a credencial.

### 4. Rotacionar sem perder leitura

```powershell
npm run security:keys -- --from "C:/segredos/gestor-first.keyring.json" --file "C:/segredos/gestor-second.keyring.json" --id second
```

Aponte os processos para o novo arquivo, defina a chave ativa e reinicie-os no ambiente autorizado. Mantenha todas as chaves anteriores. Simule a migração novamente e só então aplique, usando **outro arquivo novo de backup**. Registros na chave ativa são verificados e não regravados; registros antigos são recifrados.

Uma chave só pode ser retirada após verificar registros, backups históricos, réplicas e a janela de rollback. O código não apaga chaves antigas automaticamente.

## Plano de rollback

1. Preserve o build compatível com leitura v2, a configuração e os keyrings anteriores antes da ativação. Um build antigo que só entende texto puro não é rollback seguro enquanto houver registros v2.
2. Em falha de configuração, restaure o keyring/configuração conhecida, mantendo as chaves necessárias para leitura. Não rotacione `SESSION_SECRET` para tentar recuperar dados v2.
3. Para desfazer a migração de campos planejados, simule o rollback com o mesmo banco e o arquivo autenticado:

```powershell
npm run security:migrate -- --config "C:/segredos/homologacao.security.env" --rollback "C:/backups/gestor-migration.enc"
npm run security:migrate -- --config "C:/segredos/homologacao.security.env" --rollback "C:/backups/gestor-migration.enc" --apply
```

4. A reversão só confirma se todos os registros ainda contiverem os valores esperados. Alterações posteriores são preservadas: um conflito cancela toda a transação. Não existe opção de forçar a sobrescrita.
5. O backup de migração cobre os registros capturados naquela execução; não desfaz criações ou edições posteriores. Não volte para um leitor antigo sem comprovar que todos os dados necessários são compatíveis. O rollback operacional recomendado mantém o leitor v2.
6. As colunas TEXT, tabelas de eventos/contadores e versão de sessão permanecem. Não é necessário apagar tabelas, truncar campos ou mudar senhas para voltar ao build compatível.
7. Restauração de um dump completo é feita em **outro banco vazio**, validado antes de qualquer troca de destino. O comando de restauração recusa banco ocupado e ambiente declarado como produção.

Produção exige aprovação separada antes de configuração, migração, reinício ou troca de banco. O CLI tem uma trava `--approve-production` para migração, mas a existência dessa opção não constitui aprovação. Ela não foi usada nesta entrega.

## Sessões e experiência de uso

Minha Conta agora oferece confirmação de identidade e revogação global. Após 15 minutos sem autenticação recente, operações protegidas orientam a confirmar a senha em Minha Conta e realizar a ação novamente. Formulários já abertos podem exigir recarga após a rotação do cookie/token; a confirmação não reenvia automaticamente uma operação crítica.

Administradores não mantêm uma sessão de 30 dias: máximo de 8 horas e inatividade de 15 minutos. Configurações são `SESSION_ADMIN_IDLE_MS` e `SESSION_ADMIN_ABSOLUTE_MS`. Sessões comuns mantêm os limites documentados na etapa 1. Mudança de `session_version`, senha, usuário ou papel invalida a identidade na próxima requisição. Não cancela transações que já estavam executando.

A mudança no cálculo de revisão exige novo login para sessões anteriores à etapa 2. Revogação global encerra também a sessão que fez o pedido e exige senha atual correta. A confirmação de identidade não substitui MFA.

## Infraestrutura: verificado e pendente

- `npm run security:inspect` verifica configuração sem imprimir valores secretos e sem abrir conexão com o banco. O ambiente corrente foi identificado como desenvolvimento, sem keyring de dados e sem TLS de banco configurado. A aplicação passa a aceitar dotenv separado por `GESTOR_ENV_FILE`.
- Firewall Windows local: os perfis Domain, Private e Public estavam habilitados. Isso não comprova regras de entrada corretas nem firewall da hospedagem. A inspeção não identificou listener permanente na porta local 3306; o ensaio usou uma porta temporária própria.
- TLS do banco é validado quando configurado; banco local de ensaio usou loopback. Não foi testado certificado MySQL remoto.
- `npm run security:tls -- --url https://seu-dominio` verifica somente handshake, certificado e protocolo em endereço público autorizado. Não foi executado contra um domínio de produção nesta entrega.
- `ENFORCE_HTTPS=true` habilita redirecionamento canônico para `APP_URL` no servidor público customizado. Ativar após validar a topologia e os cabeçalhos do proxy em homologação para evitar loops. Não usa o Host recebido para escolher o destino.
- `TRUSTED_PROXY_CIDRS` aceita endereços/CIDRs explícitos e começa com `loopback`. Configure somente proxies efetivamente controlados. O backend deve ficar inacessível diretamente pela internet; sockets locais precisam de ACL/permissões corretas.
- O servidor público customizado normaliza e assina a origem. No `next start` isolado, cabeçalhos não comprovados são descartados; não prometa identificar o IP real sem a topologia suportada. Testar Hostinger/LiteSpeed/CDN no ambiente real continua necessário.

## Testes e resultados

- `npm run check`: tipagem de backend, Next, navegador e worker; builds de backend/React/navegador; 27 templates EJS.
- `npm run test:security`: suíte da etapa 1, 15 testes.
- `npm run test:security:advanced`: 11 testes novos, incluindo GCM, isolamento, rotação, geração de chaves, spoofing de origem, CSP, metadados permitidos, erros de pagamento, dados aninhados, destino fixo do proxy e revogação HTTP de múltiplas sessões.
- `npm run test:security:database`: ensaio real MariaDB descrito acima, inclusive restauração, rollback, compatibilidade e duas conexões para os contadores.
- `npm run test:security:csp`: Chrome executa script com nonce e ação legítima; bloqueia script injetado e handlers `onclick`/`onerror`; nonces diferem por resposta.
- Suíte geral `node --import tsx --test test/*.test.mts`: 228 testes aprovados, sem falhas. `npm run build:frontend`: build de produção Next aprovado.
- `test/next-clients.browser.mts` e a variante `--custom-server --socket-backend`: fluxos locais de autenticação, navegação, edição, renovação e pagamento aprovados.
- `npm audit --omit=dev --json`: zero vulnerabilidades conhecidas na consulta após fixar `proxy-addr` em 2.0.8. Isso não comprova ausência de falhas desconhecidas.

Fixtures ignoradas em `test/` foram atualizadas para importar os adaptadores novos, representar autenticação recente e refletir o cookie administrativo mais curto. As suítes novas em `scripts/` estão disponíveis para versionamento.

## Limites e riscos que permanecem

1. **Ativação pendente:** sem configurar keyring e executar a migração aprovada, registros legados continuam nos formatos anteriores. Testar o backup real do ambiente escolhido antes de migrar. O legado Sigma ainda depende do segredo antigo até ser migrado.
2. **MFA/recuperação:** não ativados, conforme solicitado. A confirmação de senha e o limite de sessão não equivalem a um segundo fator.
3. **CSP de estilos:** `style-src 'unsafe-inline'` permanece para compatibilidade. Scripts não dependem mais dessa permissão. Scripts externos inseridos pela hospedagem/CDN precisam ser avaliados antes da publicação; a política não os autoriza automaticamente.
4. **Disponibilidade:** bloqueios são temporários, mas ataques contínuos ainda podem prejudicar contas. Dimensionar MySQL, limites e proteção de borda com métricas reais. O store compartilhado exige que todos os processos usem o mesmo banco.
5. **Eventos:** alertas internos foram implementados; encaminhamento a um serviço de monitoramento, retenção, proteção contra alteração e alertas de disco precisam ser definidos. Backups antigos não são apagados automaticamente, portanto controlar espaço é necessário.
6. **Produção:** certificados, regras reais de firewall, exposição do MySQL, privilégios do usuário SQL, TLS remoto, ACLs da hospedagem, rotação operacional de segredos e separação física dos ambientes não foram certificados por testes locais.
7. **Upload:** as proteções da etapa 1 continuam; ainda não há antivírus/transcodificação isolada.

## Referências consultadas

- [OWASP — Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP — Key Management](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
- [Next.js — Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy), além da documentação local instalada da versão 16.4.0.
- [MariaDB — pacote oficial do ensaio](https://archive.mariadb.org/mariadb-11.8.3/winx64-packages/), com checksum conferido.

Esta entrega reduz riscos identificados e fornece um processo de ativação verificável. Não declara segurança total nem substitui validação do ambiente de produção.
