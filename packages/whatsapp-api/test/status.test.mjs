import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BaileysSessionManager } from '../src/baileys-manager.js';

function fixture(t, userId = '5511999999999@s.whatsapp.net') {
  const sessionsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gestor-status-'));
  t.after(() => fs.rmSync(sessionsDir, { recursive: true, force: true }));
  const manager = new BaileysSessionManager({ sessionsDir });
  const session = manager.getOrCreateState('test');
  const sends = [];
  session.status = 'conectado';
  session.socket = {
    user: { id: userId },
    waUploadToServer: async () => ({ mediaUrl: 'https://example.com/media', directPath: '/media' }),
    waitForMessage: async () => ({ tag: 'ack', attrs: { class: 'message' } }),
    relayMessage: async (jid, message, options) => { sends.push([jid, message, options]); },
  };
  return { manager, session, sends, sessionsDir };
}

test('envia status para contatos sincronizados e normaliza o próprio número', async t => {
  const { manager, session, sends } = fixture(t);
  manager.rememberStatusContacts(session, [
    { id: '5511888888888:2@s.whatsapp.net' },
    { id: '5511888888888@s.whatsapp.net' },
    { id: '12345@lid', phoneNumber: '5511777777777@s.whatsapp.net' },
    { id: '12345@g.us' },
  ]);
  const result = await manager.sendStatus('test', 'text', { text: 'Teste', backgroundColor: '#A855F7', font: 2 });
  assert.equal(result.ok, true);
  assert.equal(sends[0][0], 'status@broadcast');
  assert.deepEqual(sends[0][2].statusJidList, ['5511888888888@s.whatsapp.net', '5511777777777@s.whatsapp.net', '5511999999999@s.whatsapp.net']);
  assert.equal(sends[0][2].additionalAttributes, undefined);
  assert.equal(sends[0][1].extendedTextMessage.font, 2);
  assert.ok(session.msgStore.has(result.messageId));
});

test('contatos continuam disponíveis depois de reiniciar a API', async t => {
  const { manager, session, sessionsDir } = fixture(t);
  manager.rememberStatusContacts(session, [{ id: '5511888888888@s.whatsapp.net' }]);
  const restarted = new BaileysSessionManager({ sessionsDir });
  assert.deepEqual([...restarted.getOrCreateState('test').statusContacts], ['5511888888888@s.whatsapp.net']);
});

test('não informa sucesso quando só o próprio número está disponível', async t => {
  const { manager, session, sends } = fixture(t);
  manager.rememberStatusContacts(session, [{ id: session.socket.user.id }]);
  await assert.rejects(manager.sendStatus('test', 'text', { text: 'Teste' }), /não foram sincronizados/);
  assert.equal(sends.length, 0);
});

test('imagem usa os destinatários sincronizados e limpa contatos ao trocar de conta', async t => {
  const { manager, session, sends } = fixture(t);
  manager.rememberStatusContacts(session, [{ id: '5511888888888@s.whatsapp.net' }]);
  await manager.sendStatus('test', 'image', { mediaUrl: 'data:image/png;base64,aGVsbG8=', caption: 'Legenda' });
  assert.ok(sends[0][1].imageMessage.url);
  assert.equal(sends[0][1].imageMessage.caption, 'Legenda');
  assert.ok(sends[0][2].statusJidList.includes('5511888888888@s.whatsapp.net'));
  manager.clearCredentials(session);
  assert.equal(session.statusContacts.size, 0);
});

test('exige confirmação do envio e preserva destinatários explícitos', async t => {
  const { manager, session } = fixture(t, '5511999999999:7@s.whatsapp.net');
  session.socket.relayMessage = async (_jid, _message, options) => {
    assert.deepEqual(options.statusJidList, ['5511888888888@s.whatsapp.net', '5511999999999@s.whatsapp.net']);
    return undefined;
  };
  session.socket.waitForMessage = async () => undefined;
  await assert.rejects(manager.sendStatus('test', 'text', { text: 'Teste' }, ['5511888888888@s.whatsapp.net']), /não confirmou/);
});

 test('recusa erro do servidor mesmo quando ha ID local', async t => {
   const { manager, session } = fixture(t);
   session.socket.waitForMessage = async () => ({ tag: 'ack', attrs: { class: 'message', error: '479' } });
   await assert.rejects(manager.sendStatus('test', 'text', { text: 'Teste' }, ['5511888888888@s.whatsapp.net']), /479/);
 });

test('LID account resolves aliases, deduplicates and includes own LID', async t => {
  const { manager, session, sends } = fixture(t);
  session.socket.user.lid = '99999:3@lid';
  const batches = [];
  session.socket.signalRepository = { lidMapping: { getLIDsForPNs: async phones => {
    batches.push(phones);
    return phones.map(pn => ({ pn, lid: '88888@lid' }));
  } } };
  await manager.sendStatus('test','text',{ text:'Teste' },['5511888888888@s.whatsapp.net','88888@lid',session.socket.user.id]);
  assert.deepEqual(batches, [['5511888888888@s.whatsapp.net']]);
  assert.deepEqual(sends[0][2].statusJidList,['88888@lid','99999@lid']);
  assert.equal(sends[0][2].additionalAttributes, undefined);
});
test('unresolved LID recipients never relay a mixed audience', async t => {
  const { manager, session, sends } = fixture(t);
  session.socket.user.lid = '99999@lid';
  session.socket.signalRepository = { lidMapping: { getLIDsForPNs: async () => [] } };
  await assert.rejects(manager.sendStatus('test','text',{ text:'Teste' },['5511888888888@s.whatsapp.net']), /1 contato/);
  assert.equal(sends.length,0);
});
test('all-LID audience does not need alias lookup', async t => {
  const { manager, session, sends } = fixture(t);
  session.socket.user.lid = '99999@lid';
  await manager.sendStatus('test','text',{ text:'Teste' },['88888@lid']);
  assert.deepEqual(sends[0][2].statusJidList,['88888@lid','99999@lid']);
});

test('large audience resolves in bounded batches and preserves every recipient', async t => {
  const { manager, session, sends } = fixture(t);
  session.socket.user.lid = '99999@lid';
  const batchSizes = [];
  session.socket.signalRepository = { lidMapping: { getLIDsForPNs: async phones => {
    batchSizes.push(phones.length);
    return phones.map(pn => ({ pn, lid: pn.replace('@s.whatsapp.net','@lid') }));
  } } };
  const phones = Array.from({length:201},(_,i)=>(5511000000000+i)+'@s.whatsapp.net');
  const result = await manager.sendStatus('test','text',{ text:'Teste' },phones);
  assert.deepEqual(batchSizes,[100,100,1]);
  assert.equal(result.recipientCount,202);
  assert.ok(sends[0][2].statusJidList.every(jid=>jid.endsWith('@lid')));
});

test('two unresolved contacts do not block the resolved audience or enter relay', async t => {
  const { manager, session, sends } = fixture(t);
  session.socket.user.lid = '99999@lid';
  const known = ['5511888888888@s.whatsapp.net','5511777777777@s.whatsapp.net','5511666666666@s.whatsapp.net'];
  manager.rememberStatusContacts(session, known.map(id=>({id})));
  session.socket.signalRepository = { lidMapping: { getLIDsForPNs: async () => [{pn:known[0],lid:'88888@lid'}] } };
  const result = await manager.sendStatus('test','text',{text:'Teste'});
  assert.deepEqual(sends[0][2].statusJidList,['88888@lid','99999@lid']);
  assert.equal(result.skippedRecipientCount,2);
  assert.equal(result.ok,true);
  assert.equal(result.recipientCount,2);
  assert.deepEqual([...session.statusContacts],known);
});

test('status text preserves line breaks and spacing exactly', async t => {
  const { manager, sends } = fixture(t);
  const text = '  Primeira linha\n\nSegunda linha  ';
  await manager.sendStatus('test','text',{text},['5511888888888@s.whatsapp.net']);
  assert.equal(sends[0][1].extendedTextMessage.text,text);
});
test('media caption preserves pasted paragraphs exactly', async t => {
  const { manager, sends } = fixture(t);
  const caption = 'Primeira linha\n\nSegunda linha\n  Contato';
  await manager.sendStatus('test','image',{mediaUrl:'data:image/png;base64,aGVsbG8=',caption},['5511888888888@s.whatsapp.net']);
  assert.equal(sends[0][1].imageMessage.caption,caption);
});
