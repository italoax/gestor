import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function load(file, modules) {
 const source=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8');
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
 const exports={};vm.runInNewContext(js,{exports,require:name=>{if(!(name in modules))throw Error(name);return modules[name];},console});return exports;
}
function service(rows,ok=true){
 const calls=[],queries=[];
 const mod=load('services/mensagemPix.ts',{'../db/mysql.js':{queryOne:async(sql,args)=>{queries.push({sql,args});return rows.shift();}},'./whatsapp.js':{enviarMensagemModeloComRetry:async(...args)=>{calls.push(args);return {ok,error:'offline'};}},'./pixConfig.js':{getPixConfig:async()=>({})}});
 return {...mod,calls,queries};
}
test('disabled preference sends nothing',async()=>{const h=service([null]);assert.equal(await h.enviarConfirmacaoPix(2,7),false);assert.equal(h.calls.length,0);});
test('selected template uses owner device and fresh customer data',async()=>{
 const h=service([{mensagem:'Pago {nome}',mediaTipo:null,mediaPath:null},{id:7,nome:'Ana',vencimento:'2026-11-01'},{sessao:'owner-device'}]);
 assert.equal(await h.enviarConfirmacaoPix(2,7),true);assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'owner-device');assert.equal(h.calls[0][1].vencimento,'2026-11-01');assert.equal(h.calls[0][2].mensagem,'Pago {nome}');
 assert.match(h.queries[0].sql,/m.user_id = u.id/);assert.match(h.queries[1].sql,/user_id = :userId/);assert.equal(h.queries[1].args.userId,2);
});
test('missing customer sends nothing',async()=>{const h=service([{mensagem:'Pago'},null]);assert.equal(await h.enviarConfirmacaoPix(2,7),false);assert.equal(h.calls.length,0);});
test('WhatsApp failures are reported instead of claiming success',async()=>{
 const h=service([{mensagem:'Pago'},{id:7},{sessao:'owner-device'}],false);await assert.rejects(h.enviarConfirmacaoPix(2,7),/offline/);
});
test('preference rejects another owners template and allows disabling',async()=>{
 let post;const writes=[],flashes=[];
 load('routes/integracaoPagamento.ts',{'../config/env.js':{env:{appUrl:'https://example.test'}},'express':{Router:()=>({get(){},post(path,handler){post=handler;}})},'../db/mysql.js':{queryOne:async()=>null,queryRows:async()=>[],execute:async(sql,args)=>writes.push(args)},'../services/paymentProvider.js':{}});
 const req={session:{user:{id:2}},body:{action:'mensagem-confirmacao',mensagem_id:'99'},flash:(...a)=>flashes.push(a)};
 const res={redirect(){}};const next=e=>{throw e;};await post(req,res,next);assert.equal(writes.length,0);assert.equal(flashes[0][0],'error');
 req.body.mensagem_id='';await post(req,res,next);assert.equal(writes[0].mensagemId,null);assert.equal(writes[0].userId,2);
});

test('repeated payment notifications dispatch confirmation once',async()=>{
 const source=fs.readFileSync(new URL('../src/routes/pagamento.ts',import.meta.url),'utf8');
 const start=source.indexOf('async function notificarPagamento(');
 const end=source.indexOf('// ============================================================',start);
 const js=ts.transpileModule(source.slice(start,end)+'\nexports.run = notificarPagamento;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
 let claimed=false,sends=0;const exports={};
 vm.runInNewContext(js,{exports,console,registrarPagamentoPendente:async()=>{const created=!claimed;claimed=true;return created;},enviarConfirmacaoPix:async()=>{sends++;}});
 await Promise.all([exports.run(1,2,7,30),exports.run(1,2,7,30)]);assert.equal(sends,1);
});

test('PIX selection only accepts an active provider of the current account',async()=>{
 let post;const writes=[];const configs=[{provider:'asaas',ativo:true},{provider:'mercadopago',ativo:false}];
 load('routes/integracaoPagamento.ts',{'../config/env.js':{env:{appUrl:'https://example.test'}},'express':{Router:()=>({get(){},post(path,handler){post=handler;}})},'../db/mysql.js':{execute:async(sql,args)=>writes.push(args)},'../services/paymentProvider.js':{carregarConfigsDoUsuario:async id=>{assert.equal(id,2);return configs;}}});
 const req={session:{user:{id:2}},body:{action:'provedor-padrao',provider:'mercadopago'},flash(){}};const res={redirect(){}};const next=e=>{throw e;};
 await post(req,res,next);assert.equal(writes.length,0);
 req.body.provider='unknown';await post(req,res,next);assert.equal(writes.length,0);
 req.body.provider='asaas';await post(req,res,next);assert.equal(writes.length,1);assert.equal(writes[0].provider,'asaas');assert.equal(writes[0].userId,2);
});
