import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as creditos from '../src/services/creditos.ts';
import * as format from '../src/services/format.ts';

function load(path, modules) {
  const source = fs.readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, console, require: key => {
    if (!(key in modules)) throw Error(`Missing mock: ${key}`);
    return modules[key];
  } });
  return exports;
}

function harness(balance = 5, options = {}) {
  let state = { balance, renewed: false, sales: 0 };
  let queue = Promise.resolve();
  let paymentConfirmed = false;
  const writes = [];
  const routes = [];
  const cliente = { id: 7, nome: 'Ana', plano: 'Mensal', servidor: 'Painel', telas: 2, valor: 50, vencimento: '2026-09-01' };
  const read = async (sql, params) => {
    if (/FROM pagamentos/.test(sql)) return params.userId === 1 && params.id === 42 && !paymentConfirmed
      ? [{clienteId:7,valor:150,periodos:1,dados:JSON.stringify({periodo:6,tipo:'Meses',creditoGastos:6}),pagoEm:'2026-09-30 12:00:00'}] : [];
    if (/FROM transacoes/.test(sql)) return state.sales ? [{id: 1}] : [];
    if (/FROM users/.test(sql)) return [{ autoRenovar: options.disabledAuto ? 0 : 1, mensagemRenovacaoId: null }];
    if (/FROM planos/.test(sql)) return [options.plano || { periodo: 30, tipo: 'Dias', creditoGastos: 1 }];
    if (/FROM servidores/.test(sql)) return options.missingServer || params.userId !== 1 ? [] : [{ id: 3, nome: 'Painel', creditos: state.balance, valorCred: 5 }];
    if (/FROM clientes/.test(sql)) return params.userId === 1 ? [cliente] : [];
    throw Error(sql);
  };
  const write = async (sql, params) => {
    writes.push({ sql, params });
    if (/UPDATE servidores/.test(sql)) {
      assert.equal(params.userId, 1);
      if (state.balance < params.consumo) return { affectedRows: 0 };
      state.balance -= params.consumo;
    } else if (/UPDATE clientes/.test(sql)) state.renewed = true;
    else if (/INSERT INTO transacoes/.test(sql)) {
      if (options.failSale) throw Error('write failed');
      state.sales++;
    } else if (/UPDATE pagamentos/.test(sql)) paymentConfirmed = true;
    else if (/UPDATE notificacoes/.test(sql)) { /* Confirmation completes the pending notice. */ }
    else throw Error(sql);
    return { affectedRows: 1 };
  };
  const conn = { query: async (...args) => [await read(...args)], execute: async (...args) => [await write(...args)] };
  const db = {
    queryOne: async (...args) => (await read(...args))[0] ?? null,
    queryRows: read, execute: write,
    withTransaction: fn => {
      const result = queue.then(async () => {
        const before = {...state};
        const previousPayment = paymentConfirmed;
        try { return await fn(conn); } catch (error) { state = before; paymentConfirmed = previousPayment; throw error; }
      });
      queue = result.catch(() => {});
      return result;
    },
  };
  const dates = { appNowSql: () => '2026-10-01 12:00:00', appTodayIso: () => '2026-10-01' };
  const auto = load('../src/services/autoRenovacao.ts', {
    '../db/mysql.js': db, '../config/env.js': { env: { localMode: false } }, './dates.js': dates,
    './whatsapp.js': {}, './pixConfig.js': {}, './notificacoes.js': { sincronizarAlertasCreditos: async () => {} }, './creditos.js': creditos,
  });
  load('../src/routes/clientes.ts', {
    'node:crypto': {}, express: { Router: () => Object.fromEntries(['get','post'].map(method => [method, (path, handler) => routes.push({ method, path, handler })])) },
    '../db/mysql.js': db, '../services/dates.js': dates, '../services/format.js': format,
    '../services/whatsapp.js': {}, '../services/pixConfig.js': {}, '../services/autoRenovacao.js': auto,
    '../services/creditos.js': creditos, '../services/crypto.js': {}, '../services/sigma.js': {}, './pagamento.js': {},
    '../services/renovacoesPendentes.js': {listarRenovacoesPendentes:async()=>[]},
  });
  return {
    state: () => state, conn, writes,
    auto: (periodos = 1, planoPago) => auto.renovarClienteAutomatico(1, 7, 50 * periodos, periodos, planoPago),
    confirm: (owner=1,id=42) => auto.renovarClienteAutomatico(owner,7,0,1,undefined,id),
    confirmed: () => paymentConfirmed,
    manual: async (changes = {}, owner = 1) => {
      const flashes = [];
      const req = { session: { user: { id: owner } }, body: { action: 'add_pagamento', id: 7, vencimento: '2026-11-01', plano: 'Mensal', servidor: 'Painel', telas: 2, creditos_gastos: 1, valor: 50, ...changes }, flash: (...args) => flashes.push(args) };
      await routes.find(r => r.method === 'post' && r.path === '/clientes').handler(req, { redirect() {} }, error => { if (error) throw error; });
      return flashes;
    },
  };
}

test('semestral: renovação automática acrescenta seis meses e debita créditos do plano por tela', async () => {
  const h = harness(12, { plano: { periodo: 6, tipo: 'Meses', creditoGastos: 6 } });
  const result = await h.auto();
  assert.equal(result.renovado, true);
  assert.equal(result.creditosConsumidos, 12);
  const update = h.writes.find(w => /UPDATE clientes/.test(w.sql));
  assert.equal(update.params.vencimento, '2027-04-01');
  assert.equal(update.params.custoPagamento, 60);
  assert.equal(h.state().balance, 0);
});

test('semestral: duas renovações consomem dois ciclos e preservam preço de um ciclo', async () => {
  const h = harness(24, { plano: { periodo: 6, tipo: 'Meses', creditoGastos: 6 } });
  await h.manual({ creditos_gastos: 2, valor: 300, vencimento: '2027-10-01' });
  const update = h.writes.find(w => /UPDATE clientes/.test(w.sql));
  assert.equal(update.params.valor, 150);
  assert.equal(update.params.valorPago, 300);
  assert.equal(update.params.custoPagamento, 120);
  assert.equal(h.state().balance, 0);
});

test('consumo do plano admite créditos fracionados', () => {
  assert.equal(creditos.consumoRenovacao(2, 2, 2.5), 10);
});

test('PIX de vários períodos estende validade e debita todos os créditos sem alterar preço base', async () => {
  const h = harness(12, { plano: { periodo: 1, tipo: 'Meses', creditoGastos: 1 } });
  const result = await h.auto(6);
  assert.equal(result.renovado, true);
  assert.equal(result.creditosConsumidos, 12);
  const update = h.writes.find(w => /UPDATE clientes/.test(w.sql));
  assert.equal(update.params.vencimento, '2027-04-01');
  assert.equal(update.params.valorPago, 300);
  assert.equal(update.params.valor, 50);
  assert.equal(update.params.periodos, 6);
  assert.equal(update.params.custoPagamento, 60);
});

test('PIX usa a duração e os créditos gravados quando a cobrança foi criada', async () => {
  const h = harness(24, { plano: { periodo: 1, tipo: 'Meses', creditoGastos: 1 } });
  const result = await h.auto(2, { periodo: 6, tipo: 'Meses', creditoGastos: 6 });
  assert.equal(result.creditosConsumidos, 24);
  const update = h.writes.find(w => /UPDATE clientes/.test(w.sql));
  assert.equal(update.params.vencimento, '2027-10-01');
});

test('manual: saldo zero, negativo ou insuficiente não altera cliente, saldo ou transações', async () => {
  for (const balance of [0, -1, 1]) {
    const h = harness(balance);
    const flashes = await h.manual();
    assert.match(flashes[0][1], /Créditos insuficientes/);
    assert.deepEqual(h.state(), { balance, renewed: false, sales: 0 });
  }
});

test('confirmação manual usa o pagamento aprovado mesmo com renovação automática desligada', async () => {
  const h=harness(12,{disabledAuto:true});
  const result=await h.confirm();assert.equal(result.renovado,true);
  assert.equal(result.novoVencimento,'2027-04-01');
  assert.equal(h.confirmed(),true);assert.equal(h.state().balance,0);
  const sale=h.writes.find(w=>/INSERT INTO transacoes/.test(w.sql));
  assert.equal(sale.params.valorVenda,150);assert.equal(sale.params.creditos,12);assert.equal(sale.params.telas,2);
  assert.equal(sale.params.data,'2026-09-30');assert.equal(sale.params.descricao,'Renovação confirmada (PIX)');
});

test('confirmação repetida ou simultânea debita créditos e registra a venda uma única vez', async () => {
  const h=harness(24,{disabledAuto:true});const results=await Promise.all([h.confirm(),h.confirm()]);
  assert.equal(results.filter(r=>r.renovado).length,1);assert.equal(h.state().balance,12);assert.equal(h.state().sales,1);
});

test('pagamento de outro dono, crédito insuficiente ou falha na venda mantém a pendência', async () => {
  const other=harness(12);assert.equal((await other.confirm(2)).renovado,false);assert.equal(other.confirmed(),false);
  const empty=harness(0);assert.equal((await empty.confirm()).renovado,false);assert.equal(empty.confirmed(),false);
  const failed=harness(12,{failSale:true});await assert.rejects(failed.confirm(),/write failed/);
  assert.equal(failed.confirmed(),false);assert.equal(failed.state().balance,12);assert.equal(failed.state().renewed,false);
});
test('manual: saldo exato permite renovar e desconta telas × períodos', async () => {
  const h = harness(6);
  await h.manual({ creditos_gastos: 3 });
  assert.deepEqual(h.state(), { balance: 0, renewed: true, sales: 1 });
});
test('manual: bloqueia consumo adulterado, servidor inexistente e cliente de outro usuário', async () => {
  for (const changes of [{creditos_gastos: 0}, {creditos_gastos: -1}, {creditos_gastos: .5}, {telas: 0}, {telas: 'NaN'}]) {
    const h = harness(); await h.manual(changes); assert.equal(h.state().renewed, false);
  }
  const missing = harness(5, {missingServer: true}); await missing.manual(); assert.equal(missing.state().renewed, false);
  const other = harness(); await other.manual({}, 2); assert.equal(other.state().renewed, false);
});
test('manual: envio simultâneo não duplica renovação nem débito', async () => {
  const h = harness(2);
  await Promise.all([h.manual(), h.manual()]);
  assert.deepEqual(h.state(), { balance: 0, renewed: true, sales: 1 });
});
test('manual e automática: falha no lançamento reverte saldo e validade', async () => {
  for (const method of ['manual', 'auto']) {
    const h = harness(5, {failSale: true});
    await assert.rejects(h[method](), /write failed/);
    assert.deepEqual(h.state(), { balance: 5, renewed: false, sales: 0 });
  }
});
test('automática: bloqueia sem saldo e aceita saldo exato por tela', async () => {
  for (const balance of [0, 1, 2]) {
    const h = harness(balance); const result = await h.auto();
    assert.equal(result.renovado, balance === 2);
    assert.equal(h.state().balance, balance === 2 ? 0 : balance);
    assert.equal(h.state().sales, balance === 2 ? 1 : 0);
    if (balance === 2) assert.equal(result.creditosConsumidos, 2);
  }
});

function notificationHarness() {
  let balance = 3, rows = [], nextId = 1;
  const pushes = [];
  const conn = {
    query: async sql => {
      if (sql.includes('FROM users')) return [[{id:1}]];
      if (sql.includes('FROM servidores')) return [balance <= 3 ? [{id:3,nome:'Painel',creditos:balance}] : []];
      if (sql.includes('FROM notificacoes')) return [rows.map(r => ({...r}))];
      throw Error(sql);
    },
    execute: async (sql, p) => {
      assert.equal(p.userId, 1);
      if (sql.includes('INSERT INTO')) rows.push({...p, id: nextId++, lida:0});
      else if (sql.includes('DELETE FROM')) rows=rows.filter(r=>r.id!==p.id);
      else {
        const row=rows.find(r=>r.id===p.id);
        Object.assign(row,{titulo:p.titulo,mensagem:p.mensagem,lida:p.novoAviso?0:row.lida});
      }
      return [{affectedRows:1}];
    },
  };
  const service = load('../src/services/notificacoes.ts', {
    '../db/mysql.js': { withTransaction: fn=>fn(conn) },
    './push.js': { enviarPushParaUsuario: async (id,p)=>pushes.push(p) },
  });
  return {service, sync:()=>service.sincronizarAlertasCreditos(1), setBalance:n=>balance=n, rows:()=>rows, pushes};
}
test('alertas: detecta saldo já baixo, preserva lido/dispensado, avisa ao zerar e remove após recarga', async () => {
  const h=notificationHarness();
  await h.sync(); assert.equal(h.rows().length,1); assert.equal(h.pushes.length,1);
  h.rows()[0].lida=2;
  h.setBalance(2); await h.sync(); assert.equal(h.rows()[0].lida,2); assert.equal(h.pushes.length,1);
  h.setBalance(0); await h.sync(); assert.equal(h.rows()[0].lida,0); assert.equal(h.pushes.length,2);
  await h.sync(); assert.equal(h.rows().length,1); assert.equal(h.pushes.length,2);
  h.setBalance(10); await h.sync(); assert.equal(h.rows().length,0);
  h.setBalance(3); await h.sync(); assert.equal(h.rows().length,1); assert.equal(h.pushes.length,3);
});
test('alertas: pagamentos e status não geram notificação nem push', async () => {
  const h=notificationHarness();
  for(const tipo of ['pagamento','status','cobranca','whatsapp','sistema']) await h.service.notificar(1,{tipo,titulo:'Outro alerta'});
  assert.equal(h.rows().length,0); assert.equal(h.pushes.length,0);
});
