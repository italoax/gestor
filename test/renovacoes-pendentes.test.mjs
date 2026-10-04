import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as format from '../src/services/format.ts';
import * as opcoes from '../src/services/renovacaoOpcoes.ts';

function harness({approved=true,failNotice=false}={}) {
  let notified=false, notices=[], queue=Promise.resolve();
  const pushes=[], writes=[];
  const payment={id:42,clienteId:7,nome:'Ana',plano:'Semestral',valor:150,periodos:1,dados:JSON.stringify({periodo:6,tipo:'Meses',creditoGastos:6}),pagoEm:'2026-10-04 12:00:00'};
  const conn={query:async(sql,p)=>{
    assert.match(sql,/status = 'approved'/);assert.match(sql,/FOR UPDATE/);
    return [approved && p.userId===2 && p.pagamentoId===42 && !notified ? [payment] : []];
  },execute:async(sql,p)=>{
    writes.push({sql,p});
    if(sql.includes('INSERT INTO notificacoes')) {if(failNotice)throw Error('notice failed');notices.push(p);}
    else if(sql.includes('UPDATE pagamentos')) notified=true;
    else throw Error('Unexpected write: '+sql);
    return [{affectedRows:1}];
  }};
  const modules={
    '../db/mysql.js':{queryRows:async()=>notices.length?[payment]:[],withTransaction:fn=>{
      const result=queue.then(async()=>{const before={notified,notices:[...notices]};try{return await fn(conn);}catch(error){notified=before.notified;notices=before.notices;throw error;}});
      queue=result.catch(()=>{});return result;
    }},
    './format.js':format,'./renovacaoOpcoes.js':opcoes,
    './push.js':{enviarPushParaUsuario:async(userId,payload)=>pushes.push({userId,payload})}
  };
  const js=ts.transpileModule(fs.readFileSync(new URL('../src/services/renovacoesPendentes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};vm.runInNewContext(js,{exports,console,require:key=>{if(!(key in modules))throw Error(key);return modules[key];}});
  return {service:exports,writes,pushes,notified:()=>notified,notices:()=>notices};
}

test('pagamento aprovado gera aviso de seis meses e não renova nem debita créditos',async()=>{
  const h=harness();assert.equal(await h.service.registrarPagamentoPendente(42,2),true);
  assert.equal(h.notified(),true);assert.equal(h.notices().length,1);assert.equal(h.pushes.length,1);
  assert.match(h.notices()[0].titulo,/Ana pagou R\$.*150,00/);
  assert.match(h.notices()[0].mensagem,/6 meses pendente no painel/);
  assert.equal(h.writes.some(w=>/UPDATE clientes|UPDATE servidores|INSERT INTO transacoes/.test(w.sql)),false);
  assert.equal((await h.service.listarRenovacoesPendentes(2))[0].duracao,'6 meses');
});

test('webhooks simultâneos criam uma única pendência e um único push',async()=>{
  const h=harness();await Promise.all([h.service.registrarPagamentoPendente(42,2),h.service.registrarPagamentoPendente(42,2)]);
  assert.equal(h.notices().length,1);assert.equal(h.pushes.length,1);
});

test('pagamento não aprovado ou de outro dono não gera aviso',async()=>{
  const h=harness({approved:false});assert.equal(await h.service.registrarPagamentoPendente(42,2),false);
  const other=harness();assert.equal(await other.service.registrarPagamentoPendente(42,3),false);
  assert.equal(h.writes.length,0);assert.equal(other.writes.length,0);
});

test('falha ao gravar aviso reverte a marcação para permitir nova tentativa',async()=>{
  const h=harness({failNotice:true});await assert.rejects(h.service.registrarPagamentoPendente(42,2),/notice failed/);
  assert.equal(h.notified(),false);assert.equal(h.pushes.length,0);
});
