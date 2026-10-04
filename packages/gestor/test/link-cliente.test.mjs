import * as shortLink from '../src/services/linkPagamentoUrl.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import ts from 'typescript';
import ejs from 'ejs';
function load(file, modules) {
 const source=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:name=>{if(!(name in modules))throw Error(name);return modules[name];},Buffer,URL,console});return exports;
}
test('link uses persisted token even when concurrent request won creation',async()=>{
 let params;
 const service=load('services/linkCliente.ts',{'node:crypto':crypto,'../db/mysql.js':{execute:async(sql,p)=>{params=p;assert.match(sql,/arquivado = 0/);},queryOne:async()=>({token:'persisted-token',alias:'short_alias_1234'})},'./linkPagamentoUrl.js': shortLink, '../config/env.js':{env:{appUrl:'https://example.test/'}}});
 assert.equal(await service.urlPagamentoDoCliente(7),'https://example.test/r/short_alias_1234');assert.equal(params.id,7);assert.equal(params.alias.length,16);
});
test('message variables resolve to individual public payment link',()=>{
 const service=load('services/whatsapp.ts',{'./linkPagamentoUrl.js': shortLink, '../config/env.js':{env:{appUrl:'https://example.test'}},'../shared/index.js':{normalizeBrazilPhone:x=>x},'./linkCliente.js':{tokenDoCliente:async()=>null}});
 const text=service.montarMensagem('{link_cliente} {link_pagamento}',{nome:'Ana',pagamentoToken:'abc123'});
 assert.equal(text,'https://example.test/p/abc123 https://example.test/p/abc123');
});

test('gera um código individual quando o cliente tem código vazio', async () => {
 let alias='';
 const service=load('services/linkCliente.ts',{'node:crypto':crypto,'../db/mysql.js':{
  execute:async(sql,params)=>{if(sql.includes('pagamento_curto')) {assert.match(sql,/pagamento_curto = ''/);alias=params.alias;}},
  queryOne:async sql=>sql.includes('AS token')?{token:'a'.repeat(32)}:{alias}
 },'../config/env.js':{env:{appUrl:'https://example.test'}}});
 assert.match(await service.urlPagamentoDoCliente(7),/^https:\/\/example\.test\/r\/[A-Za-z0-9_-]{16}$/);
});
test('public page renders subscription data and QR controls without password',()=>{
 const template=fs.readFileSync(new URL('../src/views/pages/pagar.ejs',import.meta.url),'utf8');
 const html=ejs.render(template,{cliente:{nome:'Ana',user:'ana123',telas:2,plano:'Mensal',horaVencimento:'18:00:00',pagamentoToken:'abc123',senha:'SECRET'},pagamento:null,valorFormatado:'R$ 30,00',vencimentoFormatado:'30/09/2026'});
 for(const text of ['ana123','Mensal','30/09/2026','R$ 30,00','pay-qr-img','pay-copy'])assert.ok(html.includes(text));
 assert.ok(!html.includes('SECRET'));
});

test('short links preserve all 128 token bits and decode to the existing token',()=>{
 for(let i=0;i<100;i++){
 const token=crypto.randomBytes(16).toString('hex');const path=shortLink.caminhoPagamento(token);
 assert.equal(path.length,25);assert.match(path,/^\/p\/[A-Za-z0-9_-]{22}$/);assert.equal(shortLink.tokenPagamentoOriginal(path.slice(3)),token);
 }
});
