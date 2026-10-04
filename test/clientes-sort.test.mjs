import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ejs from 'ejs';
import * as format from '../src/services/format.ts';

const template = readFileSync(new URL('../src/views/pages/clientes.ejs', import.meta.url), 'utf8');
const now = new Date('2026-09-26T15:00:00Z');
const clientes = [
  { id: 1, nome: 'Ana', status: 'Ativo', vencimento: '2026-10-20' },
  { id: 2, nome: 'Bia', status: 'Ativo', vencimento: '2026-09-25' },
  { id: 3, nome: 'Caio', status: 'Inativo', vencimento: '2026-01-01' },
  { id: 4, nome: 'Davi', status: 'Ativo', vencimento: '2026-09-26' },
  { id: 5, nome: 'Eva', status: 'Ativo', vencimento: null },
  { id: 6, nome: 'Fabio', status: 'Ativo', vencimento: '2026-09-01' },
  { id: 7, nome: 'Gabi', status: 'Ativo', vencimento: '2026-09-27' },
  { id: 8, nome: 'Hugo', status: 'Ativo', vencimento: '2026-09-01' },
];
const expectedIds = ['6', '8', '2', '4', '7', '1', '5', '3'];

function render(rows = clientes) {
  return ejs.render(template, {
    clientes: rows, planos: [], servidores: [], mensagens: [], csrfInput: '',
    noticeSuccess: [], noticeError: [],
    ...format,
    statusByVencimento: (status, date) => format.statusByVencimento(status, date, now),
    statusUrgency: (status, date) => format.statusUrgency(status, date, now),
  }, { filename: fileURLToPath(new URL('../src/views/pages/clientes.ejs', import.meta.url)) });
}

function rowIds(html) {
  return Array.from(html.matchAll(/<tr\b[^>]*data-id="(\d+)"/g), match => match[1]);
}

test('renderiza vencidos primeiro, mais atrasados antes, sem alterar a lista recebida', () => {
  const originalIds = clientes.map(cliente => cliente.id);
  assert.deepEqual(rowIds(render()), expectedIds);
  assert.deepEqual(clientes.map(cliente => cliente.id), originalIds);
});

// Adaptador mínimo de DOM para executar o script real do template, sem dependências extras.
function openPage(html = render(), readyState = 'complete') {
  function element(attributes) {
    const classes = new Set();
    const listeners = {};
    return {
      getAttribute: key => attributes[key] ?? null,
      setAttribute: (key, value) => { attributes[key] = value; },
      classList: {
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        contains: name => classes.has(name),
      },
      addEventListener: (name, handler) => { listeners[name] = handler; },
      click: () => listeners.click(),
      keydown: key => listeners.keydown({ key, preventDefault() {} }),
    };
  }
  const attributes = tag => Object.fromEntries(
    Array.from(tag.matchAll(/([\w-]+)="([^"]*)"/g), match => [match[1], match[2]]));
  const rows = Array.from(html.matchAll(/<tr\b[^>]*data-id="\d+"[^>]*>/g), match => element(attributes(match[0])));
  const headers = Array.from(html.matchAll(/<th\b[^>]*data-sort-col="[^"]+"[^>]*>/g), match => element(attributes(match[0])));
  const header = key => headers.find(th => th.getAttribute('data-sort-col') === key);
  const tbody = {
    children: rows,
    appendChild(row) { rows.splice(rows.indexOf(row), 1); rows.push(row); },
  };
  const table = {
    querySelector: selector => selector === 'tbody' ? tbody : header(selector.match(/data-sort-col="([^"]+)"/)?.[1]),
    querySelectorAll: () => headers,
  };
  let onReady;
  const document = {
    readyState,
    querySelector: () => rows.length ? table : null,
    addEventListener: (event, handler) => { if (event === 'DOMContentLoaded') onReady = handler; },
  };
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    runInNewContext(script[1], { document });
  }
  if (onReady) onReady();
  return { ids: () => rows.map(row => row.getAttribute('data-id')), header };
}

test('indica Status decrescente ao abrir e ao voltar pelo carregamento parcial', () => {
  for (const state of ['loading', 'complete']) {
    const page = openPage(render(), state);
    assert.deepEqual(page.ids(), expectedIds);
    assert.equal(page.header('status').getAttribute('aria-sort'), 'descending');
    assert.equal(page.header('status').classList.contains('sorted-desc'), true);
  }
});
