# Revisão de segurança — 15/10/2026

Este documento registra a etapa 1. A implementação seguinte, os ensaios de migração/recuperação e o plano de rollback estão em [Segurança avançada 2.0](SECURITY-ADVANCED.md). Os dados reais continuam sem migração automática.

## Escopo e arquitetura

Revisão local do código e testes em processos locais com dados fictícios. Não foram feitas alterações na hospedagem, nas contas reais, nas credenciais ou no banco de produção. Não houve teste de invasão em serviços externos.

O projeto utiliza TypeScript, Next.js 16/React 19, NestJS 12 sobre Express 5, MySQL/MariaDB via mysql2, bcrypt e express-session com armazenamento MySQL. Painel e portal do cliente têm cookies separados. O cadastro público está desativado; não foi reaberto. A sessão do portal confere uma revisão das credenciais e do link de acesso.

Já existiam consultas parametrizadas, filtros por proprietário em muitas operações, CSRF com token de sessão e comparação de tempo constante, regeneração de sessão no login, limite de login por origem, respostas genéricas para senhas incorretas, proteção de URLs externas contra SSRF, cabeçalhos Helmet e exclusão de segredos dos principais DTOs públicos. Essas defesas não comprovam ausência de outras vulnerabilidades.

Por orientação expressa do usuário, MFA e recuperação de senha foram apenas revisados, sem implementação ou ativação.

## Achados e correções implementadas

| Gravidade | Achado                                                                                                                                                   | Correção e evidência local                                                                                                                                                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alta      | O envio manual de WhatsApp aceitava uma sessão de dispositivo enviada pelo navegador sem conferir seu proprietário.                                      | Consulta do dispositivo com `user_id` da sessão antes de qualquer envio; teste impede contato com dispositivo de outra conta.                                                                                                                                                                                                             |
| Alta      | A listagem de clientes e o HTML incluíam a senha IPTV; formulários de pagamento devolviam tokens previamente salvos.                                     | Remoção da senha do SELECT da listagem, do DTO e dos atributos HTML. Tokens de pagamento permanecem no servidor; frontend recebe somente indicadores de configuração e ambiente. Edição em branco preserva os valores; remoção exige opção explícita.                                                                                     |
| Alta      | A sessão do painel continuava válida após alteração de senha, usuário ou privilégios, e não havia limites explícitos por inatividade e duração absoluta. | Metadados de autenticação na sessão e verificação de revisão das credenciais no banco em cada requisição autenticada. Mudanças e exclusão da conta invalidam a identidade na próxima requisição. Sessões vencidas são regeneradas sem identidade; cookies antigos não restauram o acesso. Falha na consulta ao banco impede a requisição. |
| Média     | O login limitava apenas a origem, permitindo tentativas distribuídas contra a mesma conta.                                                               | Contador adicional por ID real da conta, persistido no MySQL: até 10 tentativas em 15 minutos; sucesso autenticado limpa o contador. Nomes equivalentes resolvidos pelo banco usam o mesmo ID. Limite existente por origem: 5 falhas em 15 minutos.                                                                                       |
| Média     | Usuário inexistente não executava a comparação bcrypt; entradas muito longas chegavam ao comparador.                                                     | Comparação com hash bcrypt de custo 12 sem conta associada nos casos inexistentes ou bloqueados; limites de 60 caracteres para usuário e 72 bytes para senha. Isso reduz diferenças de comportamento, sem prometer tempos de resposta idênticos.                                                                                          |
| Média     | Novas senhas do painel podiam ter somente 8 caracteres.                                                                                                  | Novas senhas exigem 15 caracteres Unicode e no máximo 72 bytes; confirmação e senha atual continuam obrigatórias. Hash bcrypt mantém custo 12. Senhas antigas não são bloqueadas apenas pelo comprimento.                                                                                                                                 |
| Média     | Uploads confiavam no MIME declarado pelo cliente e aceitavam qualquer imagem/vídeo.                                                                      | Lista permitida de JPEG, PNG, GIF, WebP, MP4 e WebM, verificação de assinaturas, limite de 5 MB, quantidade de partes/campos limitada e mensagens genéricas. HTML disfarçado, SVG, MIME divergente e excesso de tamanho são testados. Assinatura não comprova que todo arquivo é benigno.                                                 |
| Média     | Configuração podia permitir cookies inseguros ou MemoryStore em produção.                                                                                | Inicialização recusa `COOKIE_SECURE=false`, `LOCAL_MODE=true` e `APP_URL` sem HTTPS em produção. Mantidos HttpOnly, SameSite e segredos de sessão fortes. Logout trata erro do armazenamento e limpa o cookie.                                                                                                                            |
| Média     | Middleware administrativo existente não era montado globalmente em `/admin` e tratava a string `"0"` como verdadeira.                                    | Prefixo administrativo exige autenticação e permissão atual do banco; conversão numérica da flag. Escritas administrativas exigem autenticação nos últimos 15 minutos. Isso protege o prefixo; não cria funcionalidades administrativas novas.                                                                                            |
| Média     | Dumps podiam incluir sessões autenticadas e eram criados com permissões padrão.                                                                          | Novos dumps não incluem as tabelas `sessions` e `auth_login_attempts`; arquivos e diretório solicitam modos POSIX 0600/0700. Não foram alterados nem apagados backups antigos. ACLs no Windows e permissões reais da hospedagem precisam de verificação própria.                                                                          |
| Baixa     | Logs de login incorporavam usuário e user-agent sem estrutura.                                                                                           | Eventos JSON com resultado, data, ID quando disponível, identificador de conta derivado por hash e origem. Senha e user-agent não são registrados por esse evento. Alterações de perfil registram somente ID e indicadores das mudanças.                                                                                                  |

Também foram adicionados HSTS em produção no Express e no Next, `Permissions-Policy` e desativação explícita de `X-Powered-By` no Express. O MySQL e o armazenamento de sessões aceitam TLS validado com `DB_SSL=true`, com CA opcional em `DB_SSL_CA`; não foi ativado TLS em uma conexão real.

## Prazos de sessão e impactos

| Sessão                   | Inatividade | Duração máxima desde o login |
| ------------------------ | ----------- | ---------------------------- |
| Painel, acesso comum     | 30 minutos  | 12 horas                     |
| Painel, “lembrar de mim” | 7 dias      | 30 dias                      |
| Portal do cliente        | 30 minutos  | 8 horas                      |

Os prazos do painel são configuráveis em milissegundos por `SESSION_IDLE_MS`, `SESSION_ABSOLUTE_MS`, `SESSION_REMEMBER_IDLE_MS` e `SESSION_REMEMBER_ABSOLUTE_MS`. Valores inválidos ou menores que um minuto impedem a inicialização. O acesso lembrado tem um prazo maior deliberadamente, preservando a função da opção existente; para contas sensíveis, reduzir esse prazo.

Consultas automáticas JSON não renovam a atividade. Navegações HTML, consultas de página Next identificadas e métodos de escrita renovam a atividade, respeitando o limite absoluto. Não há detecção de movimento de mouse: a política considera requisições ao servidor. A verificação de credenciais acrescenta uma leitura indexada por requisição autenticada do painel.

Após publicar, sessões anteriores sem os novos metadados precisam entrar novamente. Alterar senha, usuário ou permissão também exige novo login nas sessões anteriores, inclusive a que fez a mudança. A revogação não cancela uma operação que já estava executando no servidor.

O formulário de cliente não mostra mais a senha existente: vazio mantém, uma nova senha substitui e “Remover a senha atual” apaga. Os formulários de pagamento seguem a mesma regra, com uma opção explícita para remover as credenciais. Envios de credenciais pelo backend aos serviços autorizados continuam necessários às integrações.

## Arquivos e componentes modificados nesta revisão

- Login: `backend/src/auth/auth.controller.ts`, `auth.service.ts`, `auth.types.ts`, `backend/src/main.ts`, `src/services/loginAttempts.ts`, `src/db/schema.ts`.
- Sessões e autorização: `src/app.ts`, `src/middleware/sessionSecurity.ts`, `src/services/sessionSecurity.ts`, `src/types/session.d.ts`, `src/middleware/auth.ts`, `src/middleware/nativeRoutes.ts`, `src/workflows/portal.ts`.
- Configuração e transporte: `src/config/env.ts`, `src/config/http.ts`, `src/db/mysql.ts`, `src/db/sessionStore.ts`, `web/next.config.ts`.
- Clientes: `backend/src/clients/clients.service.ts`, `src/services/clientPageData.ts`, `src/services/clientMutations.ts`, `src/frontend/clients/ClientRow.tsx`, `ClientsModals.tsx`, `useClientForm.ts`.
- Pagamentos: `src/workflows/payment-settings.ts`, `src/services/frontendPageData.ts`, `src/views/pages/integracao-pagamento.ejs`, `web/features/integracao-pagamento/PaymentSettingsScreen.tsx`.
- Conta: `src/workflows/account.ts`, `src/views/pages/minha-conta.ejs`, `web/features/minha-conta/AccountScreen.tsx`.
- Uploads e backup: `src/middleware/statusUpload.ts`, `src/services/statusMedia.ts`, `src/services/backup.ts`.
- Verificação reproduzível: `scripts/security.test.mts`, comando `test:security` em `package.json`, este relatório.

Os arquivos de testes na pasta `test/` já são ignorados pelo Git neste projeto; fixtures locais foram adaptadas às proteções novas. A suíte nova em `scripts/security.test.mts` fica disponível para versionamento. As alterações anteriores no modal de novidades foram preservadas e não fazem parte dos achados desta revisão.

## Verificações executadas

- `npm run test:security`: 15 testes aprovados. Inclui HTTP real com express-session para expiração, não renovação por polling, revogação após senha/permissão, rejeição de sessão legada e falha de banco; além de upload multipart, autorização administrativa, proteção dos DTOs, CSRF, logs, política de senha e configurações de produção.
- Suíte geral local `node --import tsx --test test/*.test.mts`: 228 testes aprovados na execução registrada, incluindo autenticação Nest, logout, isolamento de proprietários, pagamentos, CSRF e integrações simuladas.
- `npm run check`: tipagem, compilação do backend, React e navegador e validação de 27 templates EJS aprovadas.
- `npm run build:frontend`: build de produção Next aprovado.
- `node --import tsx test/next-clients.browser.mts`: fluxos locais no Chrome aprovados, incluindo login, navegação Next, edição, renovação, pagamento e formulários de provedores sem preenchimento de segredos salvos.
- `npm audit --omit=dev --json`: zero vulnerabilidades conhecidas reportadas na consulta desta revisão. Isso não atesta ausência de vulnerabilidades desconhecidas.

O contador por conta foi testado com um armazenamento simulado que emula as operações SQL. Não foi executada a DDL em MySQL/MariaDB real, nem teste de concorrência contra um banco real. A tabela `auth_login_attempts` será criada pelo fluxo existente de inicialização do schema. Valide essa migração em homologação antes de publicar. Não foram feitos login, envio de mensagem, cobrança ou alteração de senha em serviços reais.

## Riscos restantes e ações necessárias

1. **Alta — dados operacionais em repouso.** `clientes.senha`, credenciais JSON dos provedores e dumps continuam contendo dados recuperáveis sem criptografia específica desses campos. A senha de login do painel usa bcrypt; a senha IPTV tem outra finalidade e é reutilizada em mensagens/integrações. É necessário preparar migração desses campos com criptografia autenticada, chave separada, versões de chave e restauração testada. Não substituí esses dados por hashes que impediriam as integrações. A criptografia existente de Sigma deriva sua chave do `SESSION_SECRET`: rotacioná-lo sem migrar os segredos pode torná-los ilegíveis.
2. **Alta — MFA administrativo.** Não existe segundo fator obrigatório; implementação adiada por solicitação do usuário. Preparar inscrição confirmada em autenticador, segredo cifrado, códigos de recuperação com hash, prevenção de reutilização e recuperação administrativa antes de exigir MFA.
3. **Média — recuperação de senha e notificações.** Não foi identificado um fluxo de recuperação implementado. Antes de habilitar: definir serviço de e-mail e remetente, emitir token aleatório de curta duração, armazenar somente seu hash, consumir de forma atômica e única, responder genericamente, limitar solicitações, revogar sessões e enviar notificação após a troca. Não existe envio automático de notificação por e-mail nesta entrega.
4. **Média — CSP.** O projeto ainda permite `unsafe-inline` e scripts de CDN. Os escapes existentes e DTOs menores não substituem a migração de scripts inline para arquivos/nonces e a revisão das dependências externas.
5. **Média — proxies e disponibilidade.** O limite por origem continua em memória e reinicia com o processo; o novo limite por conta é compartilhado no banco. `trust proxy=1` e os cabeçalhos encaminhados precisam refletir a topologia real; restringir o acesso direto ao backend e sobrescrever cabeçalhos no proxy. O bloqueio por conta é uma janela fixa, sem escalada progressiva; ataques podem causar indisponibilidade temporária à conta. Monitorar e ajustar com dados reais, sem remover o limite.
6. **Produção não verificada.** Confirmar redirecionamento HTTP para HTTPS no proxy, certificados, regras de rede do MySQL, TLS quando remoto, conta de banco com permissões mínimas, permissões de arquivos, retenção de logs e backups, criptografia do disco e restauração. A validação de `APP_URL` e os cabeçalhos não configuram o proxy, firewall ou servidor MySQL.
7. **Arquivos e monitoramento.** Validação por assinatura não é antivírus nem decodificação completa. Considerar transcodificação/varredura isolada de mídias, limites adicionais por conta e alertas externos. Os eventos adicionados não constituem uma trilha completa e imutável de todas as operações administrativas.
8. **Privacidade.** Não foi auditada a conformidade jurídica. Definir responsáveis, finalidade, retenção, exclusão/exportação e atendimento de solicitações de titulares; conferir exposição dos backups existentes e acesso aos logs. Uma revisão técnica local não certifica adequação à LGPD.

## Referências técnicas consultadas

- [OWASP — Authentication](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html): política de senha, respostas genéricas e limites de autenticação.
- [OWASP — Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html): limites por inatividade/duração absoluta e invalidação no servidor.
- [OWASP — File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): lista permitida, limites e verificação de conteúdo em camadas.

As melhorias estão no workspace. Este relatório não declara que o site está totalmente seguro nem que a infraestrutura de produção foi validada.
