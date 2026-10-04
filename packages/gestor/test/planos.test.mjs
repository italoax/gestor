import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as format from '../src/services/format.ts';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/routes/simpleCrud.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;

async function submit(body, options = {}) {
  let handler;
  const writes = [], flashes = [];
  const modules = {
    express: { Router: () => ({ get() {}, post(path, fn) { if (path === '/planos') handler = fn; } }) },
    '../services/format.js': format,
    '../db/mysql.js': {
      queryRows: async () => [],
      queryOne: async (sql, params) => {
        assert.equal(params.userId, 7);
        if (sql.includes('SELECT nome')) return options.missing ? null : { nome: 'Mensal' };
        if (sql.includes('FROM clientes')) return options.linked ? { id: 1 } : null;
        return options.duplicate ? { id: 2 } : null;
      },
      execute: async (sql, params) => { writes.push({ sql, params }); }
    }
  };
  vm.runInNewContext(source, { exports: {}, require: name => {
    if (!(name in modules)) throw Error(name);
    return modules[name];
  } });
  await handler({ body, session: { user: { id: 7 } }, flash: (...args) => flashes.push(args) },
    { redirect: url => assert.equal(url, '/planos') }, error => { throw error; });
  return { writes, flashes };
}
const valid = { action: 'create_plano', nome: 'Trimestral', tipo: 'Meses', periodo: '3', creditos: '2.50', sigma_connections: '2', sigma_package_id: 'pacote-123', ativo: '1', observacao: 'Descrição' };

test('cria plano com período, créditos, Sigma, descrição e estado', async () => {
  const { writes, flashes } = await submit(valid);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /INSERT INTO planos/);
  const data = writes[0].params;
  assert.equal(data.tipo, 'Meses'); assert.equal(data.periodo, 3);
  assert.equal(data.creditoGastos, 2.5); assert.equal(data.sigmaConnections, 2);
  assert.equal(data.sigmaPackageId, 'pacote-123'); assert.equal(data.ativo, 1);
  assert.equal(data.observacao, 'Descrição'); assert.equal(flashes[0][0], 'success');
});

test('rejeita dados inválidos sem gravar', async () => {
  for (const change of [{ nome: ' ' }, { tipo: 'Anos' }, { periodo: '' }, { periodo: '-1' }, { periodo: '1.5' }, { creditos: '' }, { creditos: '-1' }, { creditos: 'abc' }, { creditos: '0.001' }, { sigma_connections: '0' }, { sigma_connections: '1.5' }, { sigma_package_id: 'x'.repeat(121) }, { action: 'unknown' }]) {
    const result = await submit({ ...valid, ...change });
    assert.equal(result.writes.length, 0, JSON.stringify(change));
    assert.equal(result.flashes[0][0], 'error');
  }
});

test('edição propaga nome e permite desativar', async () => {
  const result = await submit({ ...valid, action: 'update_plano', id: '9', ativo: undefined });
  assert.equal(result.writes.length, 3);
  assert.equal(result.writes[0].params.ativo, 0);
  assert.match(result.writes[1].sql, /UPDATE clientes/);
  assert.match(result.writes[2].sql, /UPDATE transacoes/);
});

test('bloqueia duplicados, planos inexistentes e exclusão com clientes', async () => {
  for (const [body, options] of [[valid, { duplicate: true }], [{ ...valid, action: 'update_plano', id: 9 }, { missing: true }], [{ action: 'delete_plano', id: 9 }, { linked: true }]]) {
    const result = await submit(body, options);
    assert.equal(result.writes.length, 0);
    assert.equal(result.flashes[0][0], 'error');
  }
  const result = await submit({ action: 'delete_plano', id: 9 });
  assert.match(result.writes[0].sql, /DELETE FROM planos/);
  assert.equal(result.writes[0].params.userId, 7);
});
