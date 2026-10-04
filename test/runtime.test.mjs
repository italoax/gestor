import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import ts from 'typescript';
import { fetchWithTimeout } from '../src/services/http.ts';

function load(path, modules) {
  const exports = {};
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(compiled, { exports, console, AbortController, setInterval, clearInterval, require: key => {
    if (!(key in modules)) throw Error(`Missing mock: ${key}`);
    return modules[key];
  } });
  return exports;
}

for (const body of [false, true]) {
  test(`external request timeout covers ${body ? 'unfinished body' : 'missing headers'} without retrying POST`, async t => {
    let calls = 0;
    const server = http.createServer((req, res) => {
      calls++;
      if (body) { res.writeHead(200); res.write('{'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    await assert.rejects(async () => {
      const response = await fetchWithTimeout(`http://127.0.0.1:${server.address().port}`, { method: 'POST' }, 150);
      await response.text();
    }, error => ['TimeoutError', 'AbortError'].includes(error.name));
    assert.equal(calls, 1);
  });
}

test('dashboard invalidates after successful writes and includes renewal confirmation', () => {
  const invalidated = [];
  const { invalidarCacheMiddleware } = load('../src/middleware/invalidarCache.ts', { '../routes/dashboard.js': { invalidarDashboardCache: id => invalidated.push(id) } });
  for (const [path, status, expected] of [['/clientes', 302, true], ['/pagamentos/42/confirmar-renovacao', 200, true], ['/clientes', 500, false], ['/status', 200, false]]) {
    const res = new EventEmitter(); res.statusCode = status;
    const before = invalidated.length;
    let next = false;
    invalidarCacheMiddleware({ method: 'POST', path, session: { user: { id: 7 } } }, res, () => next = true);
    assert.equal(next, true);
    assert.equal(invalidated.length, before);
    res.emit('finish');
    assert.equal(invalidated.length, before + Number(expected));
  }
});

test('status shutdown completes the current publication and leaves later schedules untouched', async () => {
  let release;
  let started;
  const publishing = new Promise(resolve => started = resolve);
  const writes = [];
  const cron = load('../src/services/statusCron.ts', {
    'node:timers/promises': { setTimeout: sleep },
    '../config/env.js': { env: { localMode: false } },
    '../db/mysql.js': {
      queryRows: async () => [1, 2].map(id => ({ id, userId: 7, sessao: 'principal', tipo: 'text', texto: 'Teste' })),
      execute: async (sql, params) => { writes.push({ sql, params }); return { affectedRows: 1 }; },
    },
    './whatsapp.js': { postarStatus: async () => { started(); await new Promise(resolve => release = resolve); return { ok: true, response: {} }; } },
    './notificacoes.js': { notificar: async () => {} },
  });
  const run = cron.executarAgendados();
  await publishing;
  let stopped = false;
  const stop = cron.stopStatusCron().then(() => stopped = true);
  await sleep(5);
  assert.equal(stopped, false);
  release();
  assert.equal((await run).postados, 1);
  await stop;
  assert.equal(writes.some(write => write.params.id === 2), false);
  assert.equal((await cron.executarAgendados()).skipped, true);
});

test('billing shutdown cancels long pauses without reserving unsent customers or completing the rule', async () => {
  let waiting;
  const paused = new Promise(resolve => waiting = resolve);
  const writes = [];
  let sent = 0;
  const cron = load('../src/services/cobrancasCron.ts', {
    'node:timers/promises': { setTimeout: (...args) => { if (args[2]?.signal) waiting(); return sleep(...args); } },
    '../config/env.js': { env: { localMode: false, whatsapp: { sendMinDelaySec: 60, sendMaxDelaySec: 60 } } },
    '../db/mysql.js': {
      queryRows: async sql => {
        if (sql.includes('FROM cobrancas c')) return [{ id: 5, userId: 7, tipo: 'todos', minDelay: 60, maxDelay: 60 }];
        if (sql.includes('FROM clientes')) return [{ id: 1 }, { id: 2 }];
        if (sql.includes('FROM whatsapp_devices')) return [{ sessao: 'principal' }];
        throw Error(sql);
      },
      queryOne: async () => null,
      execute: async (sql, params) => { writes.push({ sql, params }); return { affectedRows: 1, insertId: 10 }; },
    },
    './dates.js': { appHhmm: () => '12:00', appNowSql: () => '2026-10-04 12:00:00', appTodayIso: () => '2026-10-04', appWeekday: () => 0 },
    './whatsapp.js': { enviarMensagemModeloComRetry: async () => { sent++; return { ok: true }; } },
    './pixConfig.js': { getPixConfig: async () => ({}) },
    './logger.js': { createLogger: () => ({ error() {}, warn() {} }) },
  });
  const run = cron.executarCobrancasAutomaticas();
  await paused;
  await cron.stopCobrancasCron();
  assert.equal((await run).skipped, true);
  assert.equal(sent, 1);
  assert.equal(writes.filter(write => write.sql.includes('INSERT IGNORE')).length, 1);
  assert.equal(writes.some(write => write.sql.includes('ultima_execucao')), false);
  assert.equal((await cron.executarCobrancasAutomaticas()).skipped, true);
});
