import { randomUUID } from 'node:crypto';
import { mtlsJson } from './mtls.ts';
import { required, oauthToken, qrImage, cents } from './pixSupport.ts';

export function createBankPixProvider(
  name: 'efi' | 'inter',
  transport = mtlsJson,
) {
  function config(credentials) {
    for (const field of [
      'client_id',
      'client_secret',
      'certificate_pem',
      'chave_pix',
    ])
      required(credentials, field);
    const sandbox = credentials.ambiente === 'sandbox';
    const base =
      name === 'efi'
        ? sandbox
          ? 'https://pix-h.api.efipay.com.br'
          : 'https://pix.api.efipay.com.br'
        : sandbox
          ? 'https://cdpj-sandbox.partners.uatinter.co'
          : 'https://cdpj.partners.bancointer.com.br';
    return { base, path: name === 'efi' ? '/v2' : '/pix/v2' };
  }
  async function call(
    credentials,
    path,
    init: { method?: string; body?: string } = {},
  ) {
    const cfg = config(credentials);
    const token = await oauthToken(credentials, name, () =>
      transport(
        cfg.base + (name === 'efi' ? '/oauth/token' : '/oauth/v2/token'),
        credentials,
        {
          method: 'POST',
          headers:
            name === 'efi'
              ? {
                  Authorization:
                    'Basic ' +
                    Buffer.from(
                      `${credentials.client_id}:${credentials.client_secret}`,
                    ).toString('base64'),
                  'Content-Type': 'application/json',
                }
              : { 'Content-Type': 'application/x-www-form-urlencoded' },
          body:
            name === 'efi'
              ? JSON.stringify({ grant_type: 'client_credentials' })
              : new URLSearchParams({
                  grant_type: 'client_credentials',
                  client_id: credentials.client_id,
                  client_secret: credentials.client_secret,
                  scope: 'cob.write cob.read',
                }).toString(),
        },
      ),
    );
    return transport(cfg.base + cfg.path + path, credentials, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(name === 'inter' && credentials.conta_corrente
          ? { 'x-conta-corrente': String(credentials.conta_corrente) }
          : {}),
      },
    });
  }
  return {
    name,
    verifiedApi: true,
    async criarPix(credentials, params) {
      const txid = randomUUID().replace(/-/g, '');
      const result = await call(credentials, `/cob/${txid}`, {
        method: 'PUT',
        body: JSON.stringify({
          calendario: { expiracao: 3600 },
          valor: { original: (cents(params.valor) / 100).toFixed(2) },
          chave: credentials.chave_pix,
          solicitacaoPagador: String(params.descricao || 'Renovação').slice(
            0,
            140,
          ),
          infoAdicionais: [
            { nome: 'gestorReference', valor: params.externalReference },
          ],
        }),
      });
      let qrText = result.pixCopiaECola;
      if (!qrText && name === 'efi' && result.loc?.id)
        qrText = (
          await call(
            credentials,
            `/loc/${encodeURIComponent(result.loc.id)}/qrcode`,
          )
        ).qrcode;
      if (!qrText || String(result.txid) !== txid)
        throw new Error('O banco não retornou a cobrança PIX esperada.');
      return {
        id: txid,
        status: result.status,
        qrText,
        qrBase64: await qrImage(qrText),
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
    },
    async consultarPagamento(credentials, id) {
      if (!/^[a-zA-Z0-9]{26,35}$/.test(id))
        throw new Error('Identificador PIX inválido.');
      const result = await call(credentials, `/cob/${id}`);
      return {
        id: String(result.txid ?? ''),
        currency: 'BRL',
        amount: Number(result.valor?.original),
        externalReference: result.infoAdicionais?.find(
          (info) => info.nome === 'gestorReference',
        )?.valor,
        status:
          result.status === 'CONCLUIDA'
            ? 'approved'
            : result.status === 'ATIVA'
              ? 'pending'
              : 'rejected',
        pagoEm: result.pix?.[0]?.horario ?? null,
      };
    },
  };
}
export const efiProvider = createBankPixProvider('efi');
export const interProvider = createBankPixProvider('inter');
