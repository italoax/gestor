# Revisão de segurança — 06/10/2026

## Complemento de 06/10/2026

- O login IPTV agora retorna a mesma mensagem para usuário inexistente, senha incorreta, conta arquivada, bloqueada ou sem senha, evitando revelar o estado do cadastro.
- Alterar usuário ou senha em Minha Conta exige a senha atual. O endpoint aceita até 10 solicitações por conta em 15 minutos. Novas senhas exigem pelo menos 8 caracteres e no máximo 72 bytes, evitando truncamento pelo bcrypt.
- O nome do download de backup utiliza o ID numérico da conta, sem inserir o nome de usuário no cabeçalho HTTP.
- Falhas do cron retornam mensagem genérica; detalhes ficam no log do servidor.
- Validação local: compilação aprovada, 105 testes aprovados e `npm.cmd audit --json` sem vulnerabilidades conhecidas. Os testes cobrem reautenticação, limite de tentativas, senha multibyte, cabeçalho de download e respostas uniformes do portal.
- As mudanças estão somente no projeto local. Esta revisão não valida a infraestrutura de produção nem comprova ausência de outras falhas.

Revisão local do código, configuração e dependências. Não foi executado teste de invasão na hospedagem, nem acesso ao banco de produção. Nenhuma credencial foi alterada ou incluída neste relatório.

## Problemas corrigidos

| Problema                                                                                                                 | Correção                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O limitador de login descartava tentativas com senha errada, porque o redirecionamento HTTP 302 era considerado sucesso. | Apenas uma autenticação concluída com sessão salva deixa de contar no limite. Testado com o middleware real via HTTP.                                                                                                                                                                                                  |
| O gestor mantinha um webhook público de WhatsApp sem uso na integração atual.                                            | Webhook removido; o WhatsApp utiliza exclusivamente a API própria de sessões, autenticada por token.                                                                                                                                                                                                                   |
| URLs cadastradas no Sigma e no push permitiam requisições do servidor para redes internas (SSRF).                        | HTTPS na porta 443, sem credenciais embutidas; bloqueio de IPs privados/reservados e de respostas DNS inseguras na própria conexão. Sigma não segue redirecionamentos, tem prazo total de 30 segundos e resposta limitada a 1 MB; push tem timeout de socket. A validação também cobre inscrições push já armazenadas. |
| JSON inserido diretamente nos scripts do dashboard e pagamento podia encerrar a tag `script`.                            | Escape de `<` antes de inserir os dados no HTML, preservando os valores em JavaScript.                                                                                                                                                                                                                                 |
| Logs HTTP incluíam URLs com tokens de cron, pagamento e acesso ao cliente.                                               | O logger da aplicação passa a registrar método, status e duração, sem URL.                                                                                                                                                                                                                                             |
| Exceções CSRF por prefixo também correspondiam a nomes de rotas não relacionados.                                        | Delimitadores de caminho restringem as exceções.                                                                                                                                                                                                                                                                       |

## Validação

- `npm.cmd run build`: compilação aprovada.
- `npm.cmd test`: 82 testes aprovados, incluindo regressões de segurança e envio autenticado pela API própria de WhatsApp.
- `npm.cmd audit --json`: zero vulnerabilidades conhecidas reportadas na consulta.
- `.env` e suas variantes estão ignorados pelo Git; nenhum arquivo `.env` foi encontrado entre os arquivos atualmente rastreados. Isso não comprova ausência de segredos em todo o histórico.

## Configuração e limites da revisão

- O `.env` local usa `NODE_ENV=development`. Na hospedagem, confirmar `NODE_ENV=production`, HTTPS e cookies seguros. O código já rejeita `SESSION_SECRET` curto em produção. O valor local foi verificado sem exibição.
- O WhatsApp utiliza `WA_SESSION_API_URL` e `WA_SESSION_API_TOKEN`. O token precisa coincidir com `API_TOKEN` no ambiente da API própria; não há configuração de webhook de WhatsApp no gestor.
- Integrações Sigma ou push com HTTP, IP privado ou porta diferente de 443 passam a ser recusadas. Utilizar o endereço HTTPS público da integração.
- `trust proxy` permanece configurado para um salto, conforme o cenário Hostinger/Cloudflare descrito no projeto. É necessário verificar na infraestrutura que o Node só recebe tráfego pelo proxy esperado, que sobrescreve os cabeçalhos encaminhados. A revisão local não confirma essa topologia.
- O rate limiter usa memória do processo. Várias instâncias exigem armazenamento compartilhado ou limitação adicional no proxy; reiniciar o processo zera os contadores.
- A CSP existente ainda permite scripts inline e jsDelivr. A remoção dessas permissões exige adaptar os scripts e o carregamento dinâmico da interface; o escape aplicado aqui corrige os pontos de inserção JSON identificados.
- Os webhooks de pagamento consultam o provedor com credenciais do proprietário antes de atualizar o estado. Não foram realizadas cobranças nem validações reais com provedores externos.
- Verificar também os logs do proxy/CDN: a alteração no logger Node não remove registros antigos nem modifica logs da hospedagem.
- As alterações estão no projeto local e precisam passar pelo processo normal de publicação para proteger o site em produção.

## Referências

- [express-rate-limit: configuração do critério de sucesso](https://github.com/express-rate-limit/express-rate-limit/blob/main/readme.md).
