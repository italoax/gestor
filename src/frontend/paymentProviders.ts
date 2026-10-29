// Campos públicos do formulário; credenciais de outros provedores não entram no DTO.
export const paymentProviders = {
  mercadopago: {
    icon: '/assets/images/payment-providers/mercadopago.svg',
    color: '#00b1ea',
    support: 'https://www.mercadopago.com.br/developers/panel/app',
    help: 'Pegue o Access Token no Painel de Desenvolvedores → sua aplicação → Credenciais de produção.',
    fields: [['access_token', 'Access Token', 'APP_USR-...']],
  },
  asaas: {
    icon: '/assets/images/payment-providers/asaas.png',
    color: '#0adfa1',
    support: 'https://www.asaas.com/customerApiAccessToken/index',
    help: 'Pegue o Access Token em Configurações → Integrações → Tokens da API.',
    fields: [
      ['access_token', 'Access Token', '$aact_...'],
      ['ambiente', 'Ambiente'],
    ],
  },
  openpix: {
    icon: '/assets/images/payment-providers/openpix.ico',
    color: '#133a6f',
    support: 'https://app.openpix.com.br/home/applications',
    help: 'Crie uma aplicação em app.openpix.com.br e copie o AppID.',
    fields: [['app_id', 'AppID', 'Client_Id_...']],
  },
  pagbank: {
    icon: '/assets/images/payment-providers/pagbank.ico',
    color: '#fff041',
    support: 'https://acesso.pagbank.com.br/connect/',
    help: 'No PagBank Connect → Tokens de API → gere um token de produção.',
    fields: [
      ['access_token', 'Access Token', 'ABC123...'],
      ['ambiente', 'Ambiente'],
    ],
  },
  pagarme: {
    icon: '/assets/images/payment-providers/pagarme.png',
    color: '#65bf2c',
    support: 'https://dashboard.pagar.me/',
    help: 'No dashboard → Desenvolvedores → Chaves → copie a Secret Key.',
    fields: [['secret_key', 'Secret Key', 'sk_...']],
  },
  abacatepay: {
    icon: '/assets/images/payment-providers/abacatepay.ico',
    color: '#14b885',
    support: 'https://docs.abacatepay.com/pages/transparents/create',
    help: 'Crie uma chave de API com as permissões TRANSPARENT:CREATE e TRANSPARENT:READ no painel AbacatePay. A chave define o modo de teste ou produção.',
    fields: [['api_key', 'Chave de API', 'Chave gerada no painel']],
  },
  pushinpay: {
    icon: '/assets/images/payment-providers/pushinpay.png',
    color: '#e8b84b',
    support: 'https://pushinpay.com.br/',
    help: 'Gere um token no painel PushinPay e autorize o IP do servidor. O ambiente sandbox precisa estar liberado na sua conta.',
    fields: [
      ['access_token', 'Token de API', 'Token gerado no painel'],
      ['ambiente', 'Ambiente'],
    ],
  },
  efi: {
    icon: '/assets/images/payment-providers/efi.png',
    color: '#ff7300',
    support: 'https://dev.efipay.com.br/docs/api-pix/credenciais/',
    help: 'Use as credenciais da API Pix com cob.read e cob.write, a chave PIX da conta e o certificado PEM. Se o PEM já contém a chave privada, o campo de chave pode ficar em branco.',
    fields: [
      ['client_id', 'Client ID'],
      ['client_secret', 'Client Secret'],
      ['chave_pix', 'Chave PIX'],
      ['certificate_pem', 'Certificado PEM', '-----BEGIN CERTIFICATE-----'],
      [
        'private_key_pem',
        'Chave privada PEM',
        'Opcional quando incluída no certificado',
      ],
      ['ambiente', 'Ambiente'],
    ],
  },
  inter: {
    icon: '/assets/images/payment-providers/inter.png',
    color: '#ff7a00',
    support: 'https://developers.inter.co/references/pix',
    help: 'Crie uma integração Inter Empresas com os escopos cob.read e cob.write. Informe o certificado, a chave privada e a chave PIX da conta.',
    fields: [
      ['client_id', 'Client ID'],
      ['client_secret', 'Client Secret'],
      ['chave_pix', 'Chave PIX'],
      ['certificate_pem', 'Certificado PEM', '-----BEGIN CERTIFICATE-----'],
      [
        'private_key_pem',
        'Chave privada PEM',
        'Cole a chave privada em formato PEM',
      ],
      [
        'conta_corrente',
        'Conta corrente',
        'Opcional para selecionar uma conta vinculada',
      ],
      ['ambiente', 'Ambiente'],
    ],
  },
  stripe: {
    icon: '/assets/images/payment-providers/stripe.svg',
    color: '#635bff',
    support: 'https://docs.stripe.com/payments/pix/accept-a-payment',
    help: 'Use sua chave secreta e habilite PIX no painel Stripe. O cliente conclui o pagamento no checkout seguro da Stripe. A chave determina teste ou produção.',
    fields: [['secret_key', 'Chave secreta', 'sk_live_... ou sk_test_...']],
  },
  picpay: {
    icon: '/assets/images/payment-providers/picpay.ico',
    color: '#21c25e',
    support:
      'https://developers-business.picpay.com/checkout/docs/api/charge-pix',
    help: 'Requer credenciamento na API de Checkout PicPay. Informe Client ID, Client Secret e a URL base fornecida no credenciamento. O cliente informa seus dados para gerar o PIX.',
    fields: [
      ['client_id', 'Client ID'],
      ['client_secret', 'Client Secret'],
      [
        'api_base',
        'URL base da API',
        'https://ecommerce-api.svcp.ppay.me/sandbox/v1',
      ],
    ],
  },
};
