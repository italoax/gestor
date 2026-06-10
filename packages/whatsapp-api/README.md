# Gestor WhatsApp API

API gratuita de WhatsApp Web com Baileys para ser usada pelo Gestor Node via WA_DRIVER=session.

## Desenvolvimento local

```bash
npm install
cp .env.example .env
npm start
```

## Endpoints

Todos os endpoints abaixo, exceto /health, exigem token quando API_TOKEN está definido.
Envie o token no header `token` ou no header `Authorization` com Bearer.

### Sessão

- GET /health
- GET /session/status/default
- GET /session/qr/default
- POST /session/start/default
- POST /session/restart/default

Fluxo:

1. Chame POST /session/start/default.
2. Chame GET /session/qr/default.
3. Leia o campo qrImage no celular pelo WhatsApp > Aparelhos conectados.
4. Confirme GET /session/status/default até status=conectado.

### Mensagens

Texto:

```bash
curl -X POST https://whatsapp.seudominio.com/api/messages/send \
  -H 'Content-Type: application/json' \
  -H 'token: seu_token' \
  -d '{"number":"5511999998888","body":"Ola"}'
```

Midia:

```bash
curl -X POST https://whatsapp.seudominio.com/api/messages/send/media \
  -H 'Content-Type: application/json' \
  -H 'token: seu_token' \
  -d '{"number":"5511999998888","mediaUrl":"https://site.com/imagem.jpg","caption":"Legenda"}'
```

Audio:

```bash
curl -X POST https://whatsapp.seudominio.com/api/messages/send/audio-forward \
  -H 'Content-Type: application/json' \
  -H 'token: seu_token' \
  -d '{"number":"5511999998888","mediaUrl":"https://site.com/audio.mp3"}'
```

## Configuracao no Gestor

No .env do gestor:

```env
WA_DRIVER=session
WA_SESSION_API_URL=https://whatsapp.seudominio.com
WA_SESSION_API_TOKEN=seu_token
WA_SESSION_NAME_DEFAULT=default
WA_SESSION_SEND_TEXT_PATH=/api/messages/send
WA_SESSION_SEND_MEDIA_PATH=/api/messages/send/media
WA_SESSION_SEND_AUDIO_PATH=/api/messages/send/audio-forward
WA_SESSION_STATUS_PATH=/session/status/{session}
WA_SESSION_QR_PATH=/session/qr/{session}
WA_SESSION_START_PATH=/session/start/{session}
WA_SESSION_RESTART_PATH=/session/restart/{session}
```

## Deploy Hostinger

Rode:

```bash
npm run deploy
```

Suba o arquivo gestor-whatsapp-api-deploy.tar como uma segunda aplicacao Node.js.

Variaveis na Hostinger:

```env
NODE_ENV=production
PORT=porta_fornecida_pela_hostinger
API_TOKEN=seu_token_forte
SESSION_NAME=default
SESSIONS_DIR=./sessions
WA_DEFAULT_COUNTRY=55
LOG_LEVEL=info
```

## Observacao

Baileys e gratuito e nao usa Chrome/Puppeteer, mas nao e API oficial da Meta. Pode desconectar e pedir QR novamente. Evite disparos em massa.
