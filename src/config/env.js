import dotenv from 'dotenv';
dotenv.config();
const DEV_SESSION_SECRET = 'dev-secret-change-me';
const nodeEnv = process.env.NODE_ENV ?? 'development';
const sessionSecret = process.env.SESSION_SECRET ?? DEV_SESSION_SECRET;
// Em produção, subir com o secret padrão de dev permite qualquer um forjar cookie
// de sessão (sabendo o secret, cookies assinados são reproduzíveis). Falha alto
// e claro pra não ir pro ar inseguro por esquecimento de configurar o .env.
if (
  nodeEnv === 'production' &&
  (sessionSecret === DEV_SESSION_SECRET || sessionSecret.length < 32)
) {
  throw new Error(
    'SESSION_SECRET ausente ou muito curto em produção. Defina no .env uma string aleatória de pelo menos 32 caracteres.',
  );
}
// Cookie `secure` normalmente segue o NODE_ENV (production => HTTPS-only).
// COOKIE_SECURE permite configurar esse comportamento explicitamente.
const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === '1'
  : nodeEnv === 'production';
export const env = {
  localMode: process.env.LOCAL_MODE === 'true',
  nodeEnv,
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST || undefined,
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  sessionSecret,
  cookieSecure,
  // Token usado pelo endpoint público de cron (/__cron/cobrancas) — pra cron externo
  // (Hostinger/cron-job.org) acordar o processo e disparar a execução.
  cronToken: process.env.CRON_TOKEN ?? '',
  db: {
    host: process.env.DB_HOST ?? '127.0.0.1',
    name: process.env.DB_NAME ?? '',
    user: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
    port: Number(process.env.DB_PORT ?? 3306),
  },
  whatsapp: {
    defaultCountry: process.env.WA_DEFAULT_COUNTRY ?? '55',
    sessionApiUrl: (process.env.WA_SESSION_API_URL ?? '').replace(/\/$/, ''),
    sessionApiToken: process.env.WA_SESSION_API_TOKEN ?? '',
    sessionNameDefault: process.env.WA_SESSION_NAME_DEFAULT || 'default',
    sessionSendTextPath:
      process.env.WA_SESSION_SEND_TEXT_PATH ?? '/api/messages/send',
    sessionSendMediaPath:
      process.env.WA_SESSION_SEND_MEDIA_PATH ?? '/api/messages/send/media',
    sessionSendAudioPath:
      process.env.WA_SESSION_SEND_AUDIO_PATH ??
      '/api/messages/send/audio-forward',
    sessionSendStickerPath:
      process.env.WA_SESSION_SEND_STICKER_PATH ?? '/api/messages/send/sticker',
    sessionStatusPath:
      process.env.WA_SESSION_STATUS_PATH ?? '/session/status/{session}',
    sessionQrPath: process.env.WA_SESSION_QR_PATH ?? '/session/qr/{session}',
    sessionStartPath:
      process.env.WA_SESSION_START_PATH ?? '/session/start/{session}',
    sessionRestartPath:
      process.env.WA_SESSION_RESTART_PATH ?? '/session/restart/{session}',
    sessionLogoutPath:
      process.env.WA_SESSION_LOGOUT_PATH ?? '/session/logout/{session}',
    sessionPairPath:
      process.env.WA_SESSION_PAIR_PATH ?? '/session/pair/{session}',
    sessionCallsBlockPath:
      process.env.WA_SESSION_CALLS_BLOCK_PATH ??
      '/session/calls-block/{session}',
    // Intervalo (em segundos) entre cada envio automático, para evitar rajada.
    sendMinDelaySec: Number(process.env.WA_SEND_MIN_DELAY ?? 3),
    sendMaxDelaySec: Number(process.env.WA_SEND_MAX_DELAY ?? 7),
  },
  // Assinatura do gestor: credencial Mercado Pago do DONO do sistema (Italo).
  // Todos os usuarios pagam a mensalidade pra essa conta. Diferente das
  // credenciais de cada user em payment_provider_configs (que sao pros
  // clientes IPTV dele). Sem token, /meu-plano fica em modo "indisponivel".
  mpMaster: {
    accessToken: process.env.MP_MASTER_ACCESS_TOKEN ?? '',
  },
  // PWA / Push notifications.
  // VAPID keys identificam o servidor que envia push. Geradas uma vez via:
  // node -e "console.log(require('web-push').generateVAPIDKeys())"
  // Sem elas o /push fica desligado (não dá erro, só não manda).
  push: {
    publicKey: process.env.VAPID_PUBLIC ?? '',
    privateKey: process.env.VAPID_PRIVATE ?? '',
    subject: process.env.VAPID_SUBJECT || 'mailto:contato@gestor.local',
  },
};
