# Diagnóstico TLS do banco — 15/10/2026

## Resultado

**O endpoint remoto passou na validação TLS a partir do computador local.** O responsável autorizou preparar e executar um diagnóstico de transporte sem credenciais, autenticação ou SQL. Foi feita uma conexão a `srv1182.hstgr.io:3306`, em 15/10/2026 às 16:48:40 UTC, encerrada após o handshake TLS. A configuração da hospedagem, dados, usuários e permissões não foram alterados.

| Verificação | Evidência observada |
| --- | --- |
| Anúncio de TLS no protocolo MySQL | Sim |
| Cadeia confiável e hostname verificado | Sim; conjunto de confiança padrão do Node local, sem CA personalizada |
| Protocolo e cifra | TLSv1.3 / TLS_AES_256_GCM_SHA384 |
| Nomes cobertos | `*.hstgr.io`, `hstgr.io` |
| Validade do certificado observado | 12/10/2026 08:16:32 GMT até 10/01/2027 08:16:31 GMT |
| SHA-256 do certificado observado | `E0:9D:F5:EA:7A:07:30:28:0D:0D:89:8F:18:26:39:05:C0:F9:80:68:7D:D9:0D:A5:67:98:37:DB:40:BD:C4:93` |
| Credenciais / comandos SQL enviados | Nenhum |

O fingerprint é evidência temporal, não pinning nem substituto da validação de cadeia/hostname. A renovação legítima do certificado pode alterá-lo. Este resultado não comprova grants, autenticação da conta, integridade de dados, topologia local, transporte das pools da aplicação ou confiança do runtime da hospedagem. Também não testa `localhost` nem o endpoint do phpMyAdmin. A hospedagem pode apresentar outro caminho de rede; repetir o diagnóstico lá requer execução autorizada.

## Ferramenta

Adicionados `scripts/security-database-tls.mts`, `scripts/lib/mysql-tls-probe.mts` e `scripts/security-database-tls.test.mts`. Sem dependências novas. A ferramenta não importa dotenv, configuração da aplicação, driver mysql2 ou pools. Usa o [SSLRequest documentado pelo MySQL](https://dev.mysql.com/doc/dev/mysql-server/latest/page_protocol_connection_phase_packets_protocol_ssl_request.html), truncado antes do campo de usuário, e encerra sem enviar HandshakeResponse ou qualquer SQL.

TLS usa `rejectUnauthorized: true`, hostname DNS e mínimo TLS 1.2. Não há retry inseguro, fallback em texto puro nem coleta com validação desativada. Entradas e tamanho da saudação são limitados, e a conexão tem prazo total de oito segundos. Erros são reportados por código, sem refletir mensagens do servidor. O handshake incompleto de autenticação pode gerar registro de conexão abortada no servidor; não houve tentativa de login.

Execução realizada, limitada ao endpoint autorizado:

```powershell
npm run security:database:tls -- --host srv1182.hstgr.io --port 3306 --approve-network
```

O comando não lê o `.env`. `--approve-network` explicita a intenção operacional; não substitui autorização do responsável. `--ca-file` é opcional e aceita arquivo PEM obtido por fonte confiável; não confiar em certificado coletado pela própria conexão sem confirmação independente. Exit 0 indica TLS verificado naquele momento, 2 indica diagnóstico de rede/TLS sem sucesso e 1 indica erro de configuração/execução.

## Configuração preparada e aplicação futura

Foram preparados **apenas no `.env` local** `DB_SSL=true` e `DB_TRANSPORT=tls`. Host, porta, credenciais e demais opções existentes foram preservados. Esse arquivo não é publicado pelo commit e não altera variáveis do painel. Não foi iniciada a aplicação sobre o banco remoto.

Para resolver o bloqueio atual de inicialização, a configuração efetiva de todos os processos no painel precisa conter:

```dotenv
DB_HOST=srv1182.hstgr.io
DB_PORT=3306
DB_SSL=true
DB_TRANSPORT=tls
```

Com o mesmo conjunto confiável observado localmente, não é necessário `DB_SSL_CA` personalizado. Não usar CA fictícia, certificado HTTPS do site ou hostname `localhost` para esse endpoint. Preservar senhas e segredos atuais. Variáveis fornecidas pelo serviço prevalecem sobre dotenv: conferir tanto painel quanto arquivo selecionado. O ajuste não precisa de exceção TCP local, aprovação de isolamento sem TLS ou alteração no registro compilado de ambientes locais.

Alterar o painel/publicar/reiniciar continua dependendo de autorização explícita. Antes disso, repetir o diagnóstico no runtime autorizado da hospedagem e revisar os bloqueios restantes dos relatórios. O comando de diagnóstico não inicia backend, worker, migrações ou cron; não usar `npm start` para testar a conexão sem revisão desses processos.

Rollback de configuração: preservar os valores anteriores em registro protegido antes de editar o painel. Se o runtime hospedado rejeitar a cadeia/hostname, interromper a publicação e diagnosticar; não desativar validação. Retornar à configuração antiga sem TLS mantém o bloqueio de segurança e não é recuperação funcional. Retornar build/configuração apenas quando ambos forem seguros e compatíveis com os dados v2; não reverter para um build que aceite SQL remoto sem TLS.

## Testes e pendências

- Sete testes locais passaram com servidor MySQL simulado e certificados gerados para o ensaio: cadeia confiável, CA não confiável, hostname divergente, servidor sem TLS, saudação inválida, timeout e destinos inválidos.
- O teste positivo verifica que o único pacote MySQL enviado tem 32 bytes de SSLRequest, antes do TLS, e que nenhum byte de aplicação é enviado dentro do túnel. As falhas não provocam nova tentativa insegura.
- Tipagem do projeto aprovada. A aplicação produtiva e suas credenciais não foram testadas.
- Pendente: aplicar configuração no alvo com autorização; comprovar o transporte no runtime hospedado; revisar startup/migrações, backup recuperável, monitoramento, webhooks e homologação conforme os relatórios anteriores.

Este ensaio acessou **somente o transporte do endpoint real, com autorização**, sem autenticação, leitura/escrita SQL ou alteração produtiva. Portanto, não deve ser descrito como teste exclusivamente local nem como liberação de produção.
