import assert from 'node:assert/strict';
import express from 'express';
import { configureHttp } from '../src/config/http.ts';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
const app = express();
configureHttp(app, process.cwd(), {
  nodeEnv: 'production',
  trustedProxyCidrs: 'loopback',
});
app.get('/', (_req, res) =>
  res.type('html').send(`<!doctype html><html><body>
  <button id="good">Ação</button><button id="bad" onclick="window.attributeAttack=true">Ataque</button>
  <script nonce="${res.locals.cspNonce}">window.trustedExecuted=true;window.actions=0;window.violations=[];document.addEventListener('securitypolicyviolation',e=>window.violations.push(e.violatedDirective));document.getElementById('good').addEventListener('click',()=>window.actions++);</script>
  <script>window.injectedAttack=true;</script><img src="/missing" onerror="window.imageAttack=true"></body></html>`),
);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const first = await fetch(base),
  second = await fetch(base);
assert.notEqual(
  first.headers.get('content-security-policy'),
  second.headers.get('content-security-policy'),
  'Nonce não é reutilizado',
);
mkdirSync('.tmp-ui', { recursive: true });
const profile = mkdtempSync(path.resolve('.tmp-ui/csp-browser-'));
const browser = spawn(
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--remote-debugging-port=0',
    '--user-data-dir=' + profile,
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let ws: WebSocket;
try {
  let port = 0;
  for (let i = 0; i < 80 && !port; i++) {
    try {
      port = Number(
        readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split(
          '\n',
        )[0],
      );
    } catch {}
    if (!port) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(port);
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const m = JSON.parse(String(event.data));
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(m.error) : p.resolve(m.result);
    }
  });
  const cdp = (method, params = {}) =>
    new Promise<any>((resolve, reject) => {
      pending.set(++id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await cdp('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });
    assert.equal(r.exceptionDetails, undefined);
    return r.result.value;
  };
  await cdp('Page.navigate', { url: base });
  for (let i = 0; i < 80; i++) {
    if (
      await evaluate(
        '!!window.trustedExecuted && document.readyState==="complete"',
      )
    )
      break;
    await new Promise((r) => setTimeout(r, 50));
  }
  await evaluate(
    'document.getElementById("good").click();document.getElementById("bad").click()',
  );
  assert.equal(await evaluate('window.actions'), 1);
  assert.equal(
    await evaluate(
      '!!window.injectedAttack || !!window.attributeAttack || !!window.imageAttack',
    ),
    false,
  );
  assert.ok((await evaluate('window.violations')).length >= 2);
  console.log(
    'PASS: Chrome bloqueia script injetado e handlers inline; script com nonce e ação legítima funcionam; nonce muda a cada resposta.',
  );
} finally {
  ws?.close();
  browser.kill();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
