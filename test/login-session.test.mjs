import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { csrfMiddleware } from '../src/middleware/csrf.ts';

test('HTTP login preserves session, ignores legacy cookie and regenerates authenticated session', async () => {
  const app = express();
  app.use(express.urlencoded({extended:false}));
  const storeExports={};
  const storeCode=ts.transpileModule(readFileSync(new URL('../src/db/sessionStore.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true},
  }).outputText;
  vm.runInNewContext(storeCode,{exports:storeExports,require:key=>({
    'express-session':session,'express-mysql-session':()=>class {},'../config/env.js':{env:{localMode:true}},
  })[key]});
  const options={secret:'test-only-session-secret-at-least-32',resave:false,saveUninitialized:false};
  // Reproduz a inicialização dos DOIS middlewares, que faltava no teste anterior.
  const panel=session({...options,name:'ixstreaming.painel.sid',store:storeExports.createSessionStore(),cookie:{path:'/'}});
  const portal=session({...options,name:'ixstreaming.cliente.sid',store:storeExports.createSessionStore(),cookie:{path:'/area-cliente'}});
  app.use((req,res,next)=>(req.path.startsWith('/area-cliente')?portal:panel)(req,res,next));
  app.use((req,res,next)=>{
    req.flash=()=>[];
    res.render=()=>res.type('html').send(res.locals.csrfInput);
    next();
  });
  app.use(csrfMiddleware);
  app.get('/area-cliente/login',(_req,res)=>res.type('html').send(res.locals.csrfInput));
  const modules={
    express, bcryptjs:{compare:async value=>value==='test-only'},
    'express-rate-limit':()=> (_req,_res,next)=>next(),
    '../db/mysql.js':{queryOne:async()=>({id:1,name:'Test',username:'test',passwordHash:'test-only'})},
  };
  const exports={};
  const compiled=ts.transpileModule(readFileSync(new URL('../src/routes/auth.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020},
  }).outputText;
  vm.runInNewContext(compiled,{exports,require:key=>modules[key],console:{log(){},warn(){}}});
  app.use(exports.authRouter);
  app.get('/dashboard',(req,res)=>res.json({authenticated:!!req.session.user}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const page=await fetch(base+'/login');
    const token=(await page.text()).match(/value="([^"]+)"/)[1];
    const cookie=page.headers.getSetCookie()[0].split(';')[0];
    assert.match(page.headers.getSetCookie()[0],/Path=\/;/);
    assert.match(cookie,/^ixstreaming\.painel\.sid=/);
    assert.equal(page.headers.get('cache-control'),'no-store');
    const portalPage=await fetch(base+'/area-cliente/login',{headers:{Cookie:cookie}});
    assert.match(portalPage.headers.getSetCookie()[0],/^ixstreaming\.cliente\.sid=.*Path=\/area-cliente;/);
    const headers={Cookie:`connect.sid=old; ${cookie}; connect.sid=conflicting`, 'x-csrf-token':token};
    const check=await fetch(base+'/login?session_check=1',{headers});
    assert.equal(check.status,200);assert.equal((await check.json()).ok,true);
    const lost=await fetch(base+'/login?session_check=1',{headers:{'x-csrf-token':token}});
    assert.equal(lost.status,409);
    const login=await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{...headers,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({_csrf:token,username:'test',password:'test-only'})});
    assert.equal(login.status,302);assert.equal(login.headers.get('location'),'/dashboard');
    const authenticatedCookie=login.headers.getSetCookie()[0].split(';')[0];
    assert.notEqual(authenticatedCookie,cookie);
    const dashboard=await fetch(base+'/dashboard',{headers:{Cookie:authenticatedCookie}});
    assert.equal((await dashboard.json()).authenticated,true);
  } finally { server.closeAllConnections();await new Promise(resolve=>server.close(resolve)); }
});
