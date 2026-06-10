import dotenv from "dotenv";

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  db: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    name: process.env.DB_NAME ?? "",
    user: process.env.DB_USER ?? "",
    password: process.env.DB_PASSWORD || process.env.DB_PASS || "",
    port: Number(process.env.DB_PORT ?? 3306),
  },
  whatsapp: {
    driver: (process.env.WA_DRIVER ?? "cloud").toLowerCase(),
    accessToken: process.env.WA_ACCESS_TOKEN ?? "",
    phoneNumberId: process.env.WA_PHONE_NUMBER_ID ?? "",
    apiVersion: process.env.WA_API_VERSION ?? "v20.0",
    defaultCountry: process.env.WA_DEFAULT_COUNTRY ?? "55",
    verifyToken: process.env.WA_VERIFY_TOKEN ?? "",
    appSecret: process.env.WA_APP_SECRET ?? "",
    sessionApiUrl: (process.env.WA_SESSION_API_URL ?? "").replace(/\/$/, ""),
    sessionApiToken: process.env.WA_SESSION_API_TOKEN ?? "",
    sessionNameDefault: process.env.WA_SESSION_NAME_DEFAULT || "default",
    sessionSendTextPath: process.env.WA_SESSION_SEND_TEXT_PATH ?? "/api/messages/send",
    sessionSendMediaPath: process.env.WA_SESSION_SEND_MEDIA_PATH ?? "/api/messages/send/media",
    sessionSendAudioPath: process.env.WA_SESSION_SEND_AUDIO_PATH ?? "/api/messages/send/audio-forward",
    sessionSendStickerPath: process.env.WA_SESSION_SEND_STICKER_PATH ?? "/api/messages/send/sticker",
    sessionStatusPath: process.env.WA_SESSION_STATUS_PATH ?? "/session/status/{session}",
    sessionQrPath: process.env.WA_SESSION_QR_PATH ?? "/session/qr/{session}",
    sessionStartPath: process.env.WA_SESSION_START_PATH ?? "/session/start/{session}",
    sessionRestartPath: process.env.WA_SESSION_RESTART_PATH ?? "/session/restart/{session}",
    wppconnectSession: process.env.WA_WPPCONNECT_SESSION ?? process.env.WA_SESSION_NAME_DEFAULT ?? "default",
    wppconnectAutoStart: ["1", "true", "yes", "sim"].includes(String(process.env.WA_WPPCONNECT_AUTO_START ?? "false").toLowerCase()),
    wppconnectHeadless: process.env.WA_WPPCONNECT_HEADLESS === "false" ? false : true,
    wppconnectTokensDir: process.env.WA_WPPCONNECT_TOKENS_DIR ?? "./tokens",
    wppconnectBrowserPath: process.env.WA_WPPCONNECT_BROWSER_PATH ?? "",
    // Intervalo (em segundos) entre cada envio automático, para evitar rajada.
    sendMinDelaySec: Number(process.env.WA_SEND_MIN_DELAY ?? 3),
    sendMaxDelaySec: Number(process.env.WA_SEND_MAX_DELAY ?? 7),
  },
};
