import test from 'node:test';
import assert from 'node:assert/strict';
import { csrfMiddleware } from '../src/middleware/csrf.ts';
function request(token) {
 const req={method:'POST',path:'/area-cliente/login',session:{},body:{_csrf:token},get:()=>undefined};
 const res={locals:{},set(){},status(n){this.code=n;return this;},render(view,data){this.view=view;this.data=data;}};
 return {req,res};
}
test('expired customer form renders fresh login outside admin layout',()=>{
 const {req,res}=request('old-token');let passed=false;csrfMiddleware(req,res,()=>passed=true);
 assert.equal(passed,false);assert.equal(res.code,403);assert.equal(res.view,'pages/area-cliente');assert.equal(res.data.layout,false);assert.ok(res.locals.csrfInput.includes(req.session.csrfToken));
 req.body._csrf=req.session.csrfToken;csrfMiddleware(req,res,()=>passed=true);assert.equal(passed,true);
});
test('invalid multibyte token is rejected without crashing',()=>{
 const {req,res}=request('\u00e9'.repeat(64));csrfMiddleware(req,res,()=>assert.fail('accepted invalid token'));assert.equal(res.code,403);
});

test('expired administrative login renders a fresh form instead of internal error',()=>{
 const {req,res}=request('old-token');req.path='/login';
 csrfMiddleware(req,res,()=>assert.fail('accepted expired token'));
 assert.equal(res.code,403);assert.equal(res.view,'pages/login');assert.equal(res.data.user,null);
 assert.ok(res.locals.csrfInput.includes(req.session.csrfToken));
 req.body._csrf=req.session.csrfToken;
 let accepted=false;csrfMiddleware(req,res,()=>accepted=true);assert.equal(accepted,true);
});
