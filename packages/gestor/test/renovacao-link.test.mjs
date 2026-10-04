import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as opcoes from '../src/services/renovacaoOpcoes.ts';
import * as format from '../src/services/format.ts';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/routes/pagamento.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true }
}).outputText;

function harness(plano = { periodo: 1, tipo: 'Meses', creditoGastos: 1 }) {
  const routes = [], charges = [], writes = [], reads = [];
  const cliente = { id: 7, userId: 2, nome: 'Ana', plano: 'Plano', valor: 30, pagamentoToken: 'a'.repeat(32), vencimento: '2026-10-01' };
  const modules = {
    'node:crypto': crypto,
    express: { Router: () => Object.fromEntries(['get','post','use'].map(method => [method, (path, ...handlers) => routes.push({method,path,handlers})])) },
    'express-rate-limit': () => (_req,_res,next) => next(),
    '../config/env.js': { env: { appUrl: 'https://example.test' } },
    '../db/mysql.js': {
      queryOne: async (sql, params) => {
        reads.push({sql,params});
        if (sql.includes('FROM clientes')) return cliente;
        if (sql.includes('FROM planos')) return plano;
        return null;
      },
      execute: async (sql, params) => { writes.push({sql,params});return {insertId:42,affectedRows:1}; }
    },
    '../services/paymentProvider.js': {
      escolherProvedor: async () => ({provider:'mercadopago',credenciais:{}}),
      getProvider: () => ({criarPix: async (_credentials, payload) => {charges.push(payload);return {id:'pix-1',qrText:'code',qrBase64:'qr',status:'pending'};}}),
      normalizeStatus: value => value
    },
    '../services/format.js': format,
    '../services/notificacoes.js': {}, '../services/autoRenovacao.js': {}, '../services/mensagemPix.js': {},
    '../services/linkPagamentoUrl.js': {tokenPagamentoOriginal:value=>value},
    '../services/linkCliente.js': {},
    '../services/renovacoesPendentes.js': {},
    '../services/renovacaoOpcoes.js': opcoes
  };
  vm.runInNewContext(source, {exports:{},console,require:name=>{if (!(name in modules)) throw Error(name);return modules[name];}});
  return {
    charges,writes,reads,
    async submit(body) {
      const response={statusCode:200,status(code){this.statusCode=code;return this;},json(data){this.data=data;}};
      await routes.find(route=>route.method==='post' && route.path==='/pagar/:token/criar').handlers.at(-1)({params:{token:cliente.pagamentoToken},body},response);
      return response;
    }
  };
}

test('mensal permite 1 a 12 meses; semestral respeita ciclos de 6 meses', () => {
  assert.equal(opcoes.opcoesRenovacao({periodo:1,tipo:'Mês'},30).length,12);
  assert.deepEqual(opcoes.opcoesRenovacao({periodo:6,tipo:'Meses'},150), [
    {periodos:1,label:'6 meses',valor:150}, {periodos:2,label:'12 meses',valor:300}
  ]);
  assert.equal(opcoes.opcoesRenovacao({periodo:30,tipo:'Dias'},30)[2].label,'3 meses');
});

test('PIX calcula valor no servidor e grava escolha, duração e créditos do plano', async () => {
  const h=harness(); const response=await h.submit({periodos:6,valor:0.01});
  assert.equal(response.data.ok,true);
  assert.equal(h.charges[0].valor,180);
  assert.equal(h.writes[0].params.valor,180);
  assert.equal(h.writes[0].params.periodos,6);
  assert.deepEqual(JSON.parse(h.writes[0].params.renovacaoDados),{periodo:1,tipo:'Meses',creditoGastos:1});
  assert.match(h.reads.find(row=>row.sql.includes('FROM pagamentos')).sql,/renovacao_periodos = :periodos/);
});

test('semestral cobra dois semestres quando seleciona 12 meses', async () => {
  const h=harness({periodo:6,tipo:'Meses',creditoGastos:6});
  await h.submit({periodos:2});assert.equal(h.charges[0].valor,60);
  assert.match(h.charges[0].descricao,/12 meses/);
});

test('quantidades adulteradas não criam cobrança', async () => {
  for (const periodos of [0,-1,1.5,13,'NaN']) {
    const h=harness();const response=await h.submit({periodos});
    assert.equal(response.statusCode,400);assert.equal(h.charges.length,0);assert.equal(h.writes.length,0);
  }
});
