import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/assets/js/login.js', import.meta.url),'utf8');
function harness(fail=false, lostSession=false) {
  const button={innerHTML:'Entrar',disabled:false},token={value:'expired'};
  let submit, posts=0, gets=0;
  const form={querySelector:s=>s.startsWith('button')?button:s.includes('_csrf')?token:null,
    addEventListener:(name,fn)=>submit=fn,prepend:n=>form.error=n};
  vm.runInNewContext(source,{
    document:{querySelector:()=>form,createElement:()=>({dataset:{},setAttribute(){}})},
    window:{addEventListener(){}},URL,location:{assign(){}},
    fetch:async url=>{gets++;if(fail)throw Error('offline');return {ok:!url.includes('session_check')||!lostSession,url:'https://example.test'+url,text:async()=>'',json:async()=>({ok:!lostSession})};},
    DOMParser:class {parseFromString(){return {querySelector:()=>({value:'fresh'})};}},
    HTMLFormElement:{prototype:{submit(){posts++;}}},
  });
  return {button,token,form,send:()=>submit({preventDefault(){}}),counts:()=>({posts,gets})};
}
test('login refreshes stale token then submits credentials once, blocking duplicate clicks',async()=>{
  const h=harness();await Promise.all([h.send(),h.send()]);
  assert.equal(h.token.value,'fresh');assert.deepEqual(h.counts(),{posts:1,gets:2});
});
test('missing session cookie blocks credentials and explains cookie/session persistence failure',async()=>{
  const h=harness(false,true);await h.send();assert.equal(h.counts().posts,0);
  assert.equal(h.button.disabled,false);assert.match(h.form.error.textContent,/cookies/);
});
test('network failure keeps form available and never sends credentials',async()=>{
  const h=harness(true);await h.send();assert.equal(h.counts().posts,0);
  assert.equal(h.button.disabled,false);assert.ok(h.form.error);assert.equal(h.token.value,'expired');
});
