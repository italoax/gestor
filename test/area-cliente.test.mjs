import * as shortLink from '../src/services/linkPagamentoUrl.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import ts from 'typescript';
import ejs from 'ejs';
import * as renovacaoOpcoes from '../src/services/renovacaoOpcoes.ts';

const source = fs.readFileSync(new URL('../src/routes/areaCliente.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 } }).outputText;
function harness(row, plano) {
  const routes = [], writes = [], reads = [];
  const router = Object.fromEntries(['get', 'post', 'use'].map(method => [method, (path, ...handlers) => routes.push({method, path, handlers})]));
  const db = { queryOne: async (sql, args) => { reads.push({sql, args}); return sql.includes('FROM planos') && plano ? plano : row; }, queryRows: async () => Array.isArray(row) ? row : row ? [row] : [], execute: async (sql, args) => writes.push({sql, args}) };
  const modules = { 'node:crypto': crypto, bcryptjs: bcrypt, express: { Router: () => router }, 'express-rate-limit': () => (_q,_s,next) => next(), '../db/mysql.js': db, '../middleware/auth.js': { requireAuth: (req,res,next) => req.session.user ? next() : res.redirect('/login') }, '../services/linkPagamentoUrl.js': shortLink, '../services/paymentProvider.js': { escolherProvedor: async () => ({}) } };
  modules['../services/renovacaoOpcoes.js'] = renovacaoOpcoes;
  vm.runInNewContext(compiled, { exports: {}, require: key => { if (!(key in modules)) throw Error(key); return modules[key]; }, Buffer });
  const req = { get: () => undefined, body: {}, session: { cookie: {}, regenerate(cb) { delete this.user; cb(); }, save(cb) { cb(); } }, flash: () => [] };
  const res = { locals: {}, statusCode: 200, status(n) {this.statusCode=n;return this;}, sendStatus(n) {this.statusCode=n;}, redirect(path) {this.redirected=path;}, render(view,data) {this.rendered={view,data};} };
  const invoke = async (method,path,index=-1) => { const r = routes.find(r => r.method===method && r.path===path); await r.handlers.at(index)(req,res,err => {if(err) throw err;}); };
  return { req,res,invoke,writes,reads };
}
test('IPTV login authenticates and clears administrative session', async () => {
  const h = harness({id:7,user:'CLIENTE',senha:'iptv-password'});
  h.req.body={login:'CLIENTE',password:'iptv-password'}; h.req.session.user={id:1};
  await h.invoke('post','/area-cliente/login');
  assert.equal(h.req.session.cliente.id,7); assert.equal(h.req.session.user,undefined);
  assert.equal(h.res.redirected,'/area-cliente');
});
test('wrong password does not create a customer session', async () => {
  const h=harness({id:7,user:'cliente',senha:'correct-password'});
  h.req.body={login:'cliente',password:'incorrect'}; await h.invoke('post','/area-cliente/login');
  assert.equal(h.res.statusCode,401); assert.equal(h.req.session.cliente,undefined);
});
test('disabled and reset credentials invalidate existing sessions', async () => {
  for(const row of [null,{id:7,user:'cliente',senha:'new-password'}]) {
    const h=harness(row); h.req.session.cliente={id:7,revision:'old-revision'};
    await h.invoke('use','/area-cliente'); assert.equal(h.res.redirected,'/area-cliente/login'); assert.equal(h.req.session.cliente,undefined);
    assert.match(h.reads[0].sql,/arquivado = 0/);
  }
});
test('renewal ignores customer ids supplied in body', async () => {
  const h=harness({pagamento_token:'own-token'}); h.req.body={id:999,clienteId:999}; h.res.locals.portalCliente={id:7,user_id:2};
  await h.invoke('post','/area-cliente/renovar'); assert.equal(h.writes[0].args.id,7); assert.equal(h.reads[0].args.id,7); assert.equal(h.res.redirected,'/p/own-token');
});
test('admin cannot configure another owners customer', async () => {
  const h=harness(null); h.req.session.user={id:2}; h.req.body={id:999}; await h.invoke('post','/acessos-clientes');
  assert.equal(h.res.statusCode,404); assert.equal(h.reads[0].args.owner,2); assert.equal(h.writes.length,0);
});
test('admin can disable access without changing IPTV credentials', async () => {
  const h=harness({id:7}); h.req.session.user={id:2}; h.req.body={id:7,action:'disable'};
  await h.invoke('post','/acessos-clientes'); assert.equal(h.writes[0].args.blocked,1); assert.equal(h.writes[0].args.owner,2);
  assert.ok(!h.writes[0].sql.includes('senha ='));
});
test('duplicate IPTV credentials and empty passwords are rejected', async () => {
  for(const [row,password] of [[[ {id:7,user:'same',senha:'secret'}, {id:8,user:'same',senha:'secret'} ],'secret'],[{id:7,user:'same',senha:''},'']]) {
    const h=harness(row);h.req.body={login:'same',password}; await h.invoke('post','/area-cliente/login'); assert.equal(h.res.statusCode,401);assert.equal(h.req.session.cliente,undefined);
  }
});
test('portal renders login and escaped private dashboard', () => {
  const template=fs.readFileSync(new URL('../src/views/pages/area-cliente.ejs',import.meta.url),'utf8');
  const base={csrfInput:'<input name="_csrf" value="test">',erro:'',pix:true,statusByVencimento:()=>({label:'Ativo'}),formatDateBr:()=> '01/10/2026',formatMoney:()=> 'R$ 25,00'};
  assert.match(ejs.render(template,{...base,cliente:null}),/autocomplete="current-password"/);
  const html=ejs.render(template,{...base,cliente:{nome:'<script>alert(1)</script>',user:'iptv',plano:'Mensal',valor:25,telas:1}});
  assert.ok(!html.includes('<script>alert(1)</script>')); assert.match(html,/action="\/area-cliente\/renovar"/);
});

test('login checks username before password and gives specific feedback', async () => {
  const unknown=harness(null);unknown.req.body={login:'missing',password:''};await unknown.invoke('post','/area-cliente/login');assert.match(unknown.res.rendered.data.erro,/encontrado/);
  const wrong=harness({id:7,user:'cliente',senha:'correct'});wrong.req.body={login:'cliente',password:'wrong'};await wrong.invoke('post','/area-cliente/login');assert.match(wrong.res.rendered.data.erro,/Senha incorreta/);assert.equal(wrong.res.rendered.data.loginValue,'cliente');
  const blocked=harness({id:7,user:'cliente',senha:'correct',portal_bloqueado:1});blocked.req.body={login:'cliente',password:'correct'};await blocked.invoke('post','/area-cliente/login');assert.match(blocked.res.rendered.data.erro,/desativado/);assert.equal(blocked.req.session.cliente,undefined);
});

test('individual link authenticates only the linked customer',async()=>{
 const h=harness({id:7,user:'ana123',senha:'secret',pagamento_curto:'abcdefghijklmnop'});h.req.query={acesso:'abcdefghijklmnop'};
 await h.invoke('get','/area-cliente/login');
 assert.equal(h.res.redirected,'/area-cliente');assert.equal(h.req.session.cliente.id,7);assert.equal(h.req.session.user,undefined);
 assert.match(h.reads[0].sql,/portal_bloqueado = 0/);
});

test('semestral sem senha abre pelo link individual e mantém a sessão da assinatura', async () => {
  const cliente={id:7,user:'ana',senha:null,pagamento_curto:'abcdefghijklmnop',plano:'Semestral',valor:150,user_id:2};
  const h=harness(cliente,{periodo:6,tipo:'Meses',creditoGastos:6});h.req.query={acesso:cliente.pagamento_curto};
  await h.invoke('get','/area-cliente/login');
  assert.equal(h.req.session.cliente.viaLink,true);
  assert.ok(!h.reads[0].sql.includes('senha IS NOT NULL'));
  await h.invoke('use','/area-cliente');
  assert.equal(h.res.locals.portalCliente.id,7);
  assert.ok(h.req.session.cliente);
  await h.invoke('get','/area-cliente');
  assert.equal(h.res.rendered.data.cliente.plano,'Semestral');
  assert.deepEqual(h.res.rendered.data.opcoesRenovacao.map(opcao=>opcao.label),['6 meses','12 meses']);
});

test('sem senha continua sem acesso pelo login manual', async () => {
  const h=harness({id:7,user:'ana',senha:null});
  h.req.body={login:'ana',password:'anything'};
  await h.invoke('post','/area-cliente/login');
  assert.equal(h.res.statusCode,401);
  assert.equal(h.req.session.cliente,undefined);
});

test('unavailable access link cannot create a session',async()=>{const h=harness(null);h.req.query={acesso:'abcdefghijklmnop'};await h.invoke('get','/area-cliente/login');assert.equal(h.res.statusCode,401);assert.equal(h.req.session.cliente,undefined);});

test('owner can revoke a link without changing IPTV credentials',async()=>{
 const h=harness({id:7});h.req.session.user={id:2};h.req.body={id:7,action:'revoke-link'};
 await h.invoke('post','/acessos-clientes');assert.equal(h.writes.length,1);assert.match(h.writes[0].sql,/pagamento_curto = NULL/);assert.equal(h.writes[0].args.owner,2);assert.ok(!h.writes[0].sql.includes('senha ='));
});
test('revoked link invalidates an already authenticated session',async()=>{
 const original={id:7,user:'ana',senha:'secret',pagamento_curto:'abcdefghijklmnop'};
 const h=harness(original);h.req.query={acesso:'abcdefghijklmnop'};await h.invoke('get','/area-cliente/login');assert.equal(h.req.session.cliente.id,7);
 original.pagamento_curto=null;await h.invoke('use','/area-cliente');assert.equal(h.req.session.cliente,undefined);assert.equal(h.res.redirected,'/area-cliente/login');
});
test('another owner cannot revoke a customer link',async()=>{
 const h=harness(null);h.req.session.user={id:2};h.req.body={id:7,action:'revoke-link'};await h.invoke('post','/acessos-clientes');assert.equal(h.res.statusCode,404);assert.equal(h.writes.length,0);
});
