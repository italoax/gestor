import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import ejs from 'ejs';
import * as format from '../src/services/format.ts';

const root = process.cwd(), tmp = resolve(root, '.tmp-ui');
const views = resolve(root, 'packages/gestor/src/views');
const pub = resolve(root, 'packages/gestor/public');
const names = ['Android TV', 'Chromecast com Google TV', 'Dispositivo com nome muito longo para conferir a quebra de texto', 'Apple TV'];
const devices = names.map((nome, i) => ({ id: i + 1, nome, descricao: i % 2 ? 'Descrição de exemplo para conferir o espaçamento do cartão.' : '', status: i === 3 ? 'Inativo' : 'Ativo' }));
const apps = devices.map(x => ({ ...x, valorRenovacao: x.id === 1 ? 0 : 35 }));
const plans = devices.map(x => ({ ...x, nome: x.id === 1 ? 'Mensal' : x.nome, ativo: x.id !== 4, periodo: 30, tipo: 'Dias', creditos: 1, clientes: 12 }));
const servers = devices.map(x => ({ ...x, identificador: 'SRV-001', creditos: 450, clientesTotal: 12, valorCred: 2, observacaoServidor: '' }));
const messages = devices.map(x => ({ ...x, titulo: x.id === 1 ? 'Boas-vindas' : x.nome, mensagem: 'Olá, {nome}! Sua assinatura vence em {vencimento}. Acesse {link_cliente} para renovar.' }));
const clients = devices.map(x => ({ ...x, user: 'usuario' + x.id, plano: 'Mensal', servidor: servers[0].nome, telefone: '11999999999', vencimento: '2026-10-20', valor: 35, telas: 1, aplicativo: 'SmartOne', portal_bloqueado: false, temSenha: true, pagamento_curto: 'example' }));
const finances = { receita: 1200, custo: 400, lucro: 800 };
const stats = { ativos: 48, vencidos: 3, clientesTotal: 51, planosCount: 4, servidoresCount: 4, receitaCusto: { hoje: finances, mes: finances, mesAnterior: finances }, vencimentos: { hoje: { total: 5, valor: 150 }, amanha: { total: 3, valor: 90 }, ontem: { total: 2, valor: 60 } }, financeiro: { recebidoHoje: 350, recebidoMes: 2400, variacaoMes: 10, recebidoMesAnterior: 2200, projecao: 3200 }, mensagensHoje: 24, entrega: 98, regras: 4, ativas: 3, total: 80, telas: 100, creditos: 100, receita: 2500, lucro: 1500 };
const common = { ...format, title: 'Prévia', subtitle: 'Gerencie os dados da sua conta', csrfInput: '<input type="hidden" name="_csrf" value="preview">', csrfToken: 'preview', user: { id: 1, name: 'Preview' }, success: [], error: [], noticeSuccess: [], noticeError: [], dispositivos: devices, aplicativos: apps, planos: plans, servidores: servers, mensagens: messages, clientes: clients, stats };
const fixtures = {
  dispositivos: {}, aplicativos: {}, planos: {}, servidores: {}, mensagens: {}, clientes: {renovacoesPendentes:[{id:42,nome:'Ana',valor:150,duracao:'6 meses',plano:'Semestral'}]},
  transacoes: { transacoes: clients.map(x => ({ id: x.id, data: '2026-09-30', clienteNome: x.nome, formaPagamento: 'PIX', descricao: 'Renovação mensal', servidor: servers[0].nome, plano: 'Mensal', telas: 1, creditos: 1, custo: 2, valorVenda: 35, lucro: 33 })) },
  whatsapp: { sessionApi: true, devices: [{ ...devices[0], principal: true, bloqueioChamadas: false }] },
  automacao: { regras: [{ id: 1, titulo: 'Aviso de vencimento', descricao: 'Lembrete da assinatura', tipo: 'vencimento', status: 'Ativo', gatilho: 'antes', periodo: 3, tipoPeriodo: 'dias', mensagemTexto: messages[0].mensagem, recebedores: 12 }], disparos: [] },
  integracoes: { integracoes: [{ id: 1, tipo: 'sigma', nome: 'Servidor principal', status: 'ativo', apiUrl: 'https://example.test', username: 'exemplo' }] },
  'integracao-pagamento': { providers: ['mercadopago', 'asaas', 'openpix'], ativoPorProvider: { mercadopago: true }, credPorProvider: {}, providerPadrao: 'mercadopago', providerNomes: { mercadopago: 'Mercado Pago', asaas: 'Asaas', openpix: 'OpenPix' }, appUrl: 'http://example.test', mensagemConfirmacaoId: '' },
  'minha-conta': { account: { name: 'Conta de exemplo', username: 'exemplo', email: 'exemplo@example.test' } },
  status: { temWhatsapp: true, historico: [{ id: 1, tipo: 'text', texto: 'Novidades da semana', status: 'postado', createdAt: '2026-09-30', destinatarios: 50 }] },
  'acessos-clientes': { aviso: '' },
  dashboard: { novosNoMes: 12, ativosPercent: 94, vencidosPercent: 6, periodo: 'mes', topAplicativos: [], topDispositivos: [], formasPagamento: [], planosDist: [], performance: { itens: [] }, indicacoes: [], estados: { total: 0, top: [] }, paises: { total: 0, top: [] }, proximos: [], chart: '{}', geo: '{}' },
  'area-cliente': { cliente: clients[0], pix: true, erro: '', opcoesRenovacao: [{periodos:1,label:'1 mês',valor:35},{periodos:3,label:'3 meses',valor:105},{periodos:6,label:'6 meses',valor:210}] },
  pagar: { cliente: {...clients[0],pagamentoToken:'preview-payment-token'}, pagamento:null, valorFormatado:'R$ 35,00', vencimentoFormatado:'20/10/2026',periodosSelecionados:1,opcoesRenovacao:[{periodos:1,label:'1 mês',valor:35},{periodos:3,label:'3 meses',valor:105}] },
  'ix-streaming': { contactReady: true, contactUrl: () => '#contato' },
};
const standalone = new Set(['area-cliente', 'ix-streaming', 'pagar']);
const pages = new Map();
for (const [page, fixture] of Object.entries(fixtures)) {
  const locals = { ...common, ...fixture, title: page, currentPath: '/' + page };
  const body = await ejs.renderFile(resolve(views, `pages/${page}.ejs`), locals);
  pages.set('/' + page, standalone.has(page) ? body : await ejs.renderFile(resolve(views, 'layouts/main.ejs'), { ...locals, body }));
}
console.log(`${pages.size} real templates rendered with local fixtures`);
pages.set('/notice-test', await ejs.renderFile(resolve(views,'layouts/main.ejs'), {...common,title:'Aviso',currentPath:'/notice-test',body:'<div class="container">Test page</div>',success:['Status agendado <texto>'],error:['Confira os dados']}));
let chartLoads = 0;
let pendingRenewal = true;
const submissions = [];
pages.set('/dashboard', pages.get('/dashboard').replace('https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', '/assets/test-chart.js'));
const server = createServer(async (req, res) => {
  if (req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk;
    submissions.push({ url: req.url, body, csrf: req.headers['x-csrf-token'], type: req.headers['content-type'] });
    if (req.url.startsWith('/notificacoes/')) {
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true}));return;
    }
    if (req.url === '/pagamentos/42/confirmar-renovacao') {
      pendingRenewal = false;
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,novoVencimento:'2027-04-04'}));return;
    }
    if (req.url === '/area-cliente/renovar' || req.url === '/pagar/preview-payment-token/criar') {
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify(req.url === '/area-cliente/renovar' ? {pagamentoUrl:'/pagar/preview-payment-token'} : {ok:true,pagamentoId:99,qrText:'test-pix',qrBase64:'',status:'pending'}));return;
    }
    await new Promise(r=>setTimeout(r,120));
    res.writeHead(303,{Location:req.url.split('?')[0]}).end(); return;
  }
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/status/historico') {
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.end('<div class="card status-historico"><strong>Updated history</strong></div>');return;
  }
  if (path === '/notificacoes') {
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,naoLidas:pendingRenewal?1:0,items:pendingRenewal?[{id:10,pagamentoId:42,titulo:'Ana pagou R$ 150,00',mensagem:'6 meses pendente no painel',lida:0,createdAt:'2026-10-04 12:00:00',url:'/clientes#renovacoes-pendentes'}]:[]}));return;
  }
  if (path === '/clientes/preferencias/mensagem-pagamento') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ mensagemId: null })); return;
  }
  if(path === '/assets/test-chart.js') {
    chartLoads++; res.setHeader('Content-Type','text/javascript');
    res.end('window.chartAlive=0;window.Chart=class {static defaults={font:{}};constructor(){window.chartAlive++}destroy(){window.chartAlive--}}'); return;
  }
  if(path === '/offline-test') {res.writeHead(503).end('unavailable');return;}
  if (pages.has(path)) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); const html=pages.get(path);res.end(path==='/clientes' && !pendingRenewal ? html.replace(/<section class="card renewal-pending"[\s\S]*?<\/section>/,'') : html); return; }
  if (path.startsWith('/assets/')) {
    const file = resolve(pub, '.' + path);
    if (!file.startsWith(pub)) { res.writeHead(403).end(); return; }
    try { res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'image/jpeg'); res.end(await readFile(file)); } catch { res.writeHead(404).end(); }
    return;
  }
  res.setHeader('Content-Type', 'application/json'); res.end('{}');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const profile = resolve(tmp, 'chrome-' + Date.now());
await mkdir(profile, { recursive: true });
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--remote-allow-origins=*', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
try {
  let port;
  for (let i = 0; i < 80; i++) { try { port = Number((await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  assert.ok(port, 'Chrome debugging port');
  const tabs = await (await fetch(`http://127.0.0.1:${port}/json`, { signal: AbortSignal.timeout(10000) })).json();
  socket = new WebSocket(tabs.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => socket.addEventListener('open', r, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(m.error) : p.resolve(m.result); } });
  const cdp = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => { const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); assert.equal(r.exceptionDetails, undefined, JSON.stringify(r.exceptionDetails)); return r.result.value; };
  const navigate = async page => {
    await cdp('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${page}` });
    for (let i = 0; i < 100; i++) { if (await evaluate(`document.readyState === 'complete' && location.pathname === '/${page}'`)) return; await new Promise(r => setTimeout(r, 100)); }
    throw new Error('Page load timeout: ' + page);
  };
  await cdp('Page.enable'); await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*', '*cdn.jsdelivr.net*', '*google.com*', '*unpkg.com*'] });

  const settle = async () => {
    for(let i=0;i<100;i++) {
      if(await evaluate("!!window.gestorNavigate && !document.querySelector('main.app-content').hasAttribute('aria-busy')")) return;
      await new Promise(r=>setTimeout(r,50));
    }
    throw Error('Navigation did not finish');
  };
  await navigate('whatsapp'); await settle();
  for (const width of [320,390,430,1024]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<600});
    await evaluate("window.gestorSetModalState(document.getElementById('modal-wa-connect'),true)");
    assert.equal(await evaluate(`(() => {
      const modal=document.querySelector('.wa-connect-modal');
      const box=modal.querySelector('.wa-qr-box').getBoundingClientRect();
      return modal.scrollWidth<=modal.clientWidth+1 && box.width>=200 && box.right<=innerWidth;
    })()`),true,'WhatsApp QR modal fits viewport at '+width);
    await evaluate("document.querySelector('[data-wa-close]').click()");
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  await navigate('notice-test'); await settle();
  assert.equal(await evaluate("document.querySelector('[data-auto-notice]').classList.contains('open')"),true,'Site notice opens automatically');
  assert.equal(await evaluate("document.querySelector('.site-notice-message p').textContent"),'Status agendado <texto>','Notice safely preserves message text');
  await evaluate("document.querySelector('#modal-site-notice .modal-actions button').click()");
  assert.equal(await evaluate("document.querySelector('[data-auto-notice]').getAttribute('aria-hidden')"),'true','Notice closes with acknowledgement');
  await navigate('status'); await settle();
  for (const width of [320,390,430]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height:844, deviceScaleFactor:1, mobile:true });
    await evaluate("document.querySelector('[data-open-modal=modal-novo-status]').click()");
    assert.equal(await evaluate(`(() => {
      const modal=document.querySelector('.status-composer');
      return modal.scrollWidth <= modal.clientWidth + 1
        && [...modal.querySelectorAll('.status-tab')].every(el=>el.getBoundingClientRect().height>=44);
    })()`),true,'Status composer fits mobile and provides touch targets at '+width);
    await evaluate("document.querySelector('.status-tab[data-tipo=image]').click()");
    assert.equal(await evaluate("!document.getElementById('status-image-file').disabled && document.getElementById('status-video-file').disabled"),true,'Only active upload is enabled');
    await evaluate("document.querySelector('#modal-novo-status [data-close-modal]').click()");
  }
  await cdp('Emulation.clearDeviceMetricsOverride');
  await evaluate("window.statusForm = document.getElementById('form-status'); document.getElementById('status-texto').value = 'Keep draft';");
  for (let i=0;i<80;i++) {
    if (await evaluate("document.querySelector('.status-historico').textContent.includes('Updated history')")) break;
    await new Promise(r=>setTimeout(r,100));
  }
  assert.equal(await evaluate("document.querySelector('.status-historico').textContent.includes('Updated history')"), true, 'History updates automatically');
  assert.equal(await evaluate("window.statusForm === document.getElementById('form-status') && document.getElementById('status-texto').value === 'Keep draft'"), true, 'Polling preserves the form and draft');
  await navigate('clientes'); await settle();
  for (const width of [320, 390, 430]) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
    // Simulate the iPhone status bar; desktop Chrome reports a zero safe-area inset.
    await evaluate("document.documentElement.style.setProperty('--sat', '59px'); window.scrollTo(0, 300)");
    const header = await evaluate(`(() => {
      const bar = document.querySelector('.topbar2');
      const controls = [...bar.querySelectorAll('.topbar-burger, .topbar-icon, .theme-toggle, .topbar-avatar, .topbar-chip')];
      return {
        top: bar.getBoundingClientRect().top,
        accessible: controls.every(control => {
          const rect = control.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.top >= 73 && rect.width >= 44 && rect.height >= 44
            && rect.left >= 0 && rect.right <= innerWidth && control.contains(hit);
        })
      };
    })()`);
    assert.equal(header.top, 0, 'Mobile header remains visible when scrolling');
    assert.equal(header.accessible, true, 'Mobile controls clear the status bar and have accessible touch targets at ' + width);
    await evaluate("document.querySelector('.topbar-avatar').click()");
    assert.equal(await evaluate(`(() => {const menu=document.querySelector('[data-account-menu]');const rect=menu.getBoundingClientRect();return !menu.hidden && rect.left>=0 && rect.right<=innerWidth && [...menu.querySelectorAll('a')].every(link=>link.getBoundingClientRect().height>=44);})()`),true,'Account menu fits mobile viewport');
    await evaluate("document.querySelector('.topbar2-title').click()");
    assert.equal(await evaluate("document.querySelector('[data-account-menu]').hidden"),true,'Outside click closes account menu');
    await evaluate("document.querySelector('[data-sidebar-mobile]').click()");
    assert.equal(await evaluate("document.querySelector('[data-shell]').classList.contains('sidebar-open')"), true);
    await evaluate("document.querySelector('.sidebar-backdrop').click(); window.scrollTo(0, 0)");
  }
  await evaluate("document.documentElement.style.removeProperty('--sat')");
  await cdp('Emulation.clearDeviceMetricsOverride');
  assert.equal(await evaluate("document.querySelector('.sidebar-nav a[href=\"/minha-conta\"]') === null"), true);
  await evaluate("document.querySelector('.topbar-avatar').click()");
  assert.equal(await evaluate("document.querySelector('[data-account-menu]').hidden"), false);
  assert.equal(await evaluate("document.querySelector('[data-account-menu-toggle]').getAttribute('aria-expanded')"), 'true');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('[data-account-menu]').hidden"), true);
  await evaluate("document.querySelector('.topbar-avatar').click(); document.querySelector('[data-account-menu] a[href=\"/minha-conta\"]').click()"); await settle();
  assert.equal(await evaluate('location.pathname'), '/minha-conta', 'Account icon opens settings');
  assert.equal(await evaluate("document.querySelector('[data-account-menu]').hidden"), true);
  await evaluate("document.querySelector('.topbar-avatar').click(); document.querySelector('[data-account-menu] a[href=\"/integracao-pagamento\"]').click()"); await settle();
  assert.equal(await evaluate('location.pathname'), '/integracao-pagamento', 'Account menu opens payment integration');
  await evaluate("window.gestorNavigate('/clientes')"); await settle();
  await evaluate("window.documentSentinel = 'persistent'; window.savedHeader = document.querySelector('.topbar2'); window.savedSidebar = document.querySelector('.sidebar')");
  for(const page of Object.keys(fixtures).filter(p=>!standalone.has(p))) {
    await evaluate(`(() => {const a=document.createElement('a');a.href='/${page}';a.textContent='Go';document.body.append(a);a.click();a.remove();})()`);
    await settle();
    assert.equal(await evaluate('location.pathname'),'/'+page);
    assert.equal(await evaluate('window.documentSentinel'),'persistent', page+' reloaded');
    assert.equal(await evaluate("window.savedHeader === document.querySelector('.topbar2')"),true);
    assert.equal(await evaluate("window.savedSidebar === document.querySelector('.sidebar')"),true);
  }
  assert.equal(await evaluate('window.chartAlive'),2);
  await evaluate("window.gestorNavigate('/clientes')");
  assert.equal(await evaluate('window.chartAlive'),0);
  await evaluate("window.gestorNavigate('/dashboard')");
  assert.equal(await evaluate('window.chartAlive'),2);
  assert.equal(chartLoads,1,'Chart library loaded once');
  await evaluate("const period=document.querySelector('[name=periodo]');period.value='anterior';period.dispatchEvent(new Event('change',{bubbles:true}))");
  await settle(); assert.equal(await evaluate('location.search'),'?periodo=anterior');
  assert.equal(await evaluate('window.documentSentinel'),'persistent');
  for(const width of [320,390,768,1600]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    const alignment = await evaluate(`[...document.querySelectorAll('.rc-card')].map(card => {
      const rows=[...card.querySelectorAll('.rc-row')];
      return {right:rows.map(r=>r.querySelector('strong').getBoundingClientRect().right),over:rows.some(r=>r.scrollWidth>r.clientWidth),wrap:rows.some(r=>r.querySelector('span').getBoundingClientRect().height>24)};
    })`);
    for(const card of alignment) {assert.ok(Math.max(...card.right)-Math.min(...card.right)<1); assert.equal(card.over,false);assert.equal(card.wrap,false);}
  }
  await evaluate("window.gestorNavigate('/automacao')");
  await evaluate("document.querySelector('input.switch').click()"); await settle();
  assert.equal(submissions.length,1,'Switch saves once'); assert.equal(submissions[0].csrf,'preview');
  assert.match(submissions[0].type,/urlencoded/);
  await evaluate(`(() => {
    const form=document.createElement('form'); form.method='post';form.action='/automacao';
    form.innerHTML='<input name="_csrf" value="preview"><button name="action" value="save">Salvar</button>';
    document.querySelector('main.app-content').append(form);
    form.requestSubmit(form.querySelector('button')); form.requestSubmit(form.querySelector('button'));
  })()`);await settle();
  assert.equal(submissions.length,2,'Duplicate submit blocked');assert.match(submissions[1].body,/action=save/);
  await evaluate("window.gestorNavigate('/clientes')");
  await evaluate("history.back()");await new Promise(r=>setTimeout(r,200));await settle();
  assert.equal(await evaluate('location.pathname'),'/automacao');
  await evaluate("history.forward()");await new Promise(r=>setTimeout(r,200));await settle();
  assert.equal(await evaluate('location.pathname'),'/clientes');
  await evaluate("window.gestorNavigate('/offline-test')");
  assert.equal(await evaluate('location.pathname'),'/clientes');
  assert.equal(await evaluate('window.documentSentinel'),'persistent');
  assert.equal(await evaluate("document.querySelector('.navigation-notice').hidden"),false);
  await evaluate("Promise.all([window.gestorNavigate('/planos'),window.gestorNavigate('/servidores')])");
  assert.equal(await evaluate('location.pathname'),'/servidores');
  assert.equal(await evaluate('window.documentSentinel'),'persistent');
  await evaluate(`(() => {
    const form=document.createElement('form');form.method='post';form.action='/servidores';form.enctype='multipart/form-data';
    form.innerHTML='<input type="file" name="arquivo"><input name="_csrf" value="preview"><button>Salvar</button>';
    const files=new DataTransfer();files.items.add(new File(['arquivo de teste'],'exemplo.txt',{type:'text/plain'}));
    form.querySelector('input[type=file]').files=files.files;
    document.querySelector('main.app-content').append(form);form.requestSubmit(form.querySelector('button'));
  })()`);await settle();
  assert.match(submissions.at(-1).type,/multipart\/form-data/);assert.match(submissions.at(-1).body,/exemplo.txt/);
  await evaluate("window.gestorNavigate('/planos')");
  await evaluate("document.querySelector('[data-open-modal=\"modal-add-plano\"]').click()");
  assert.match(await evaluate("document.querySelector('[data-plano-info]').textContent"), /30 dias/);
  await evaluate(`(() => {
    const f=document.getElementById('modal-add-plano-form');
    f.elements.tipo.value='Meses';f.elements.periodo.value='1';f.elements.creditos.value='2.5';
    f.elements.tipo.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  assert.match(await evaluate("document.querySelector('[data-plano-info]').textContent"), /1 mês.*2,5 crédito/);
  assert.match(await evaluate("document.querySelector('[data-plano-periodo-label]').textContent"), /meses/);
  assert.equal(await evaluate("document.getElementById('modal-add-plano-form').checkValidity()"), false);
  await evaluate("document.querySelector('#modal-add-plano [data-close-modal]').click();document.querySelector('.edit-plano').click()");
  assert.equal(await evaluate("document.querySelector('#modal-add-plano-form [name=action]').value"), 'update_plano');
  await evaluate("document.querySelector('#modal-add-plano [data-close-modal]').click();document.querySelector('[data-open-modal=\"modal-add-plano\"]').click()");
  assert.equal(await evaluate("document.querySelector('#modal-add-plano-form [name=id]').value"), '');
  assert.match(await evaluate("document.querySelector('[data-plano-info]').textContent"), /30 dias.*1 crédito/);
  for(const width of [320,390,1600]) {
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:800,deviceScaleFactor:1,mobile:false});
    assert.equal(await evaluate(`(() => { const f=document.getElementById('modal-add-plano-form');return f.scrollWidth<=f.clientWidth; })()`),true);
  }
  const beforePlanSubmit = submissions.length;
  await evaluate(`(() => {
    const f=document.getElementById('modal-add-plano-form');
    f.elements.nome.value='Plano navegador';f.elements.tipo.value='Meses';f.elements.periodo.value='3';
    f.elements.creditos.value='2.5';f.elements.sigma_package_id.value='pacote-teste';
    f.elements.sigma_connections.value='2';f.elements.observacao.value='Teste de envio';
    document.querySelector('button[form="modal-add-plano-form"]').click();
  })()`); await settle();
  assert.equal(submissions.length, beforePlanSubmit + 1);
  assert.equal(submissions.at(-1).url, '/planos');
  const createdPlan = new URLSearchParams(submissions.at(-1).body);
  for (const [name,value] of Object.entries({action:'create_plano',nome:'Plano navegador',tipo:'Meses',periodo:'3',creditos:'2.5',sigma_package_id:'pacote-teste',sigma_connections:'2',observacao:'Teste de envio',ativo:'1',_csrf:'preview'})) {
    assert.equal(createdPlan.get(name),value,name);
  }
  assert.equal(await evaluate("document.querySelector('#modal-add-plano').getAttribute('aria-hidden')"),'true');
  await evaluate(`(() => {
    document.querySelector('.edit-plano').click();
    const f=document.getElementById('modal-add-plano-form');
    f.elements.nome.value='Plano editado';f.elements.ativo.checked=false;
    document.querySelector('button[form="modal-add-plano-form"]').click();
  })()`); await settle();
  const editedPlan = new URLSearchParams(submissions.at(-1).body);
  assert.equal(editedPlan.get('action'),'update_plano');
  assert.equal(editedPlan.get('nome'),'Plano editado');
  assert.ok(editedPlan.get('id'));assert.equal(editedPlan.has('ativo'),false);
  assert.equal(await evaluate('window.documentSentinel'),'persistent');
  await evaluate("window.gestorNavigate('/clientes')"); await settle();
  await evaluate(`(() => {
    const button = document.querySelector('.open-payment');
    for (const [key, value] of Object.entries({periodo:'6', tipoPeriodo:'Meses', creditosPlano:'6', valor:'150', valorCred:'2', telas:'2', vencimento:'31/08/2030'})) button.dataset[key] = value;
    button.click();
  })()`);
  const renewal = () => evaluate(`(() => {
    const form = document.getElementById('modal-add-pagamento-form');
    return { vencimento: form.elements.vencimento.value, valor: form.elements.valor.value, custo: form.elements.custo_pagamento.value, resumo: form.querySelector('[data-renovacao-periodo]').textContent };
  })()`);
  assert.deepEqual(await renewal(), { vencimento:'28/02/2031', valor:'150.00', custo:'24.00', resumo:'Renova por 6 meses. Consumo: 12 créditos do servidor.' });
  await evaluate(`(() => {const input=document.querySelector('#modal-add-pagamento-form [name="creditos_gastos"]');input.value='2';input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  assert.deepEqual(await renewal(), { vencimento:'31/08/2031', valor:'300.00', custo:'48.00', resumo:'Renova por 12 meses. Consumo: 24 créditos do servidor.' });
  await evaluate(`(() => {
    const form=document.getElementById('modal-add-pagamento-form');
    const select=form.elements.plano;
    const option=select.options[2];
    option.dataset.periodo='3';option.dataset.tipoPeriodo='Meses';option.dataset.creditosPlano='3';
    select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
    form.elements.valor.value='180';form.elements.valor.dispatchEvent(new Event('input',{bubbles:true}));
    form.elements.creditos_gastos.value='1';form.elements.creditos_gastos.dispatchEvent(new Event('input',{bubbles:true}));
  })()`);
  assert.deepEqual(await renewal(), { vencimento:'30/11/2030', valor:'90.00', custo:'12.00', resumo:'Renova por 3 meses. Consumo: 6 créditos do servidor.' });
  const selectedRenewalPlan = await evaluate("document.getElementById('modal-add-pagamento-form').elements.plano.value");
  const selectedRenewalServer = await evaluate(`(() => {
    const select=document.getElementById('modal-add-pagamento-form').elements.servidor;
    const option=select.options[2];option.dataset.valorCred='5';select.value=option.value;
    select.dispatchEvent(new Event('change',{bubbles:true}));return select.value;
  })()`);
  assert.equal((await renewal()).custo, '30.00');
  await evaluate(`new Promise(resolve => { const check=()=>document.querySelector('#modal-add-pagamento-form [name="mensagem_pagamento_id"]').disabled ? setTimeout(check,20) : resolve();check(); })`);
  await evaluate("document.getElementById('modal-add-pagamento-form').requestSubmit()"); await settle();
  const changedRenewal = new URLSearchParams(submissions.at(-1).body);
  assert.equal(changedRenewal.get('plano'), selectedRenewalPlan);
  assert.equal(changedRenewal.get('vencimento'), '30/11/2030');
  assert.equal(changedRenewal.get('custo_pagamento'), '30.00');
  assert.equal(changedRenewal.get('servidor'), selectedRenewalServer);
  await evaluate("document.querySelector('#modal-add-pagamento [data-close-modal]').click()");
  await evaluate("window.gestorNavigate('/servidores')");
  await evaluate("window.gestorNavigate('/clientes')"); await settle();
  assert.match(await evaluate("document.getElementById('renovacoes-pendentes').textContent"), /Ana.*150,00.*6 meses/s);
  await evaluate("document.querySelector('[data-notif-toggle]').click()");
  for(let i=0;i<100;i++) {
    if(await evaluate("!!document.querySelector('[data-notif-panel] [data-confirm-renovacao]')")) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(await evaluate("document.querySelector('[data-notif-panel] [data-confirm-renovacao]').textContent"),'Marcar como renovado');
  await evaluate("window.confirm=()=>true;document.querySelector('[data-notif-panel] [data-confirm-renovacao]').click()");
  for(let i=0;i<100;i++) {
    if(await evaluate("!document.getElementById('renovacoes-pendentes')")) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(await evaluate("document.getElementById('renovacoes-pendentes') === null"),true);
  assert.equal(submissions.filter(s=>s.url==='/pagamentos/42/confirmar-renovacao').length,1);
  assert.equal(submissions.find(s=>s.url==='/pagamentos/42/confirmar-renovacao').csrf,'preview');
  await evaluate("window.gestorNavigate('/servidores')");
  await evaluate(`(() => {
    const original=window.fetch; window.fetch=(url,opts)=>opts?.method==='POST'?Promise.reject(new Error('offline')):original(url,opts);
    const form=document.createElement('form');form.id='failure-form';form.method='post';form.action='/servidores';
    form.innerHTML='<input name="nome" value="Não perder"><button data-loading-text="Salvando">Salvar</button>';
    document.querySelector('main.app-content').append(form);form.querySelector('button').click();
  })()`);await settle();
  assert.equal(await evaluate("document.querySelector('#failure-form input').value"),'Não perder');
  assert.equal(await evaluate("document.querySelector('#failure-form button').disabled"),false);
  assert.equal(await evaluate("document.querySelector('#failure-form button').textContent"),'Salvar');
  assert.equal(await evaluate('window.documentSentinel'),'persistent');
  await navigate('area-cliente');
  await evaluate(`(() => {const select=document.querySelector('[name="periodos"]');select.value='6';select.dispatchEvent(new Event('change'));})()`);
  assert.match(await evaluate("document.querySelector('.portal-renew-price').textContent"), /210,00/);
  await evaluate("document.querySelector('[data-pix-form]').requestSubmit()");
  for (let i=0;i<100;i++) {
    if (await evaluate("!document.querySelector('[data-pix-details]').hidden")) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(await evaluate("document.querySelector('[data-pix-code]').value"),'test-pix');
  assert.equal(JSON.parse(submissions.at(-1).body).periodos,6);
  await navigate('pagar');
  await evaluate("const select=document.getElementById('pay-periodos');select.value='3';select.dispatchEvent(new Event('change'))");
  assert.match(await evaluate("document.getElementById('pay-amount').textContent"), /105,00/);
  await evaluate("document.getElementById('pay-btn').click()");
  for (let i=0;i<100;i++) {
    if (await evaluate("document.getElementById('pay-pix-code').textContent === 'test-pix'")) break;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.equal(await evaluate("document.getElementById('pay-pix-code').textContent"),'test-pix');
  assert.equal(JSON.parse(submissions.at(-1).body).periodos,3);
  console.log('PASS: all panel pages without document reload, dashboard scripts, GET filters, POST switches, duplicate protection, history, failure, rapid navigation and financial alignment.');
  await cdp('Browser.close');
} finally { socket?.close(); browser.kill(); server.close(); }




