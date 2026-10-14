// Campos públicos do formulário; credenciais de outros provedores não entram no DTO.
export const paymentProviders = {
  mercadopago: {
    color: '#00b1ea',
    support: 'https://www.mercadopago.com.br/developers/panel/app',
    help: 'Pegue o Access Token no Painel de Desenvolvedores → sua aplicação → Credenciais de produção.',
    fields: [['access_token', 'Access Token', 'APP_USR-...']],
  },
  asaas: {
    color: '#0adfa1',
    support: 'https://www.asaas.com/customerApiAccessToken/index',
    help: 'Pegue o Access Token em Configurações → Integrações → Tokens da API.',
    fields: [
      ['access_token', 'Access Token', '$aact_...'],
      ['ambiente', 'Ambiente'],
    ],
  },
  openpix: {
    color: '#133a6f',
    support: 'https://app.openpix.com.br/home/applications',
    help: 'Crie uma aplicação em app.openpix.com.br e copie o AppID.',
    fields: [['app_id', 'AppID', 'Client_Id_...']],
  },
  pagbank: {
    color: '#fff041',
    support: 'https://acesso.pagbank.com.br/connect/',
    help: 'No PagBank Connect → Tokens de API → gere um token de produção.',
    fields: [
      ['access_token', 'Access Token', 'ABC123...'],
      ['ambiente', 'Ambiente'],
    ],
  },
  pagarme: {
    color: '#65bf2c',
    support: 'https://dashboard.pagar.me/',
    help: 'No dashboard → Desenvolvedores → Chaves → copie a Secret Key.',
    fields: [['secret_key', 'Secret Key', 'sk_...']],
  },
};
