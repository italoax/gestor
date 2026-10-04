import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const sessionRequire = createRequire(require.resolve('express-mysql-session'));
const mysqlRoot = dirname(require.resolve('mysql2/package.json'));
const Handshake = require(join(mysqlRoot, 'lib/packets/handshake.js'));
const AuthSwitchRequest = require(join(mysqlRoot, 'lib/packets/auth_switch_request.js'));
const capabilities = require(join(mysqlRoot, 'lib/constants/client.js'));

for (const [name, driver] of [['panel', require('mysql2')], ['session store', sessionRequire('mysql2')]]) {
  test(`${name} rejects cleartext auth requested by an unencrypted server`, { timeout: 5000 }, async t => {
    const password = 'test-password-never-send-in-clear';
    const received = [];
    let switchSent = false;
    const sockets = new Set();
    function send(socket, packet, sequence) {
      packet.writeHeader(sequence);
      socket.write(packet.buffer.subarray(packet.start, packet.end));
    }
    const server = net.createServer(socket => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      let pending = Buffer.alloc(0);
      socket.on('data', chunk => {
        pending = Buffer.concat([pending, chunk]);
        while (pending.length >= 4 && pending.length >= 4 + pending.readUIntLE(0, 3)) {
          const size = 4 + pending.readUIntLE(0, 3);
          received.push(pending.subarray(4, size));
          pending = pending.subarray(size);
          if (!switchSent) {
            switchSent = true;
            send(socket, new AuthSwitchRequest({ pluginName: 'mysql_clear_password', pluginData: Buffer.alloc(0) }).toPacket(), 2);
          }
        }
      });
      send(socket, new Handshake({
        protocolVersion: 10, serverVersion: '8.0.0-test', connectionId: 1,
        capabilityFlags: capabilities.PROTOCOL_41 | capabilities.SECURE_CONNECTION | capabilities.PLUGIN_AUTH,
        characterSet: 45, statusFlags: 2,
        authPluginData1: Buffer.from('12345678'), authPluginData2: Buffer.from('abcdefghijkl'),
      }).toPacket(0), 0);
    });
    t.after(async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const connection = driver.createConnection({ host: '127.0.0.1', port: server.address().port, user: 'test-user', password, connectTimeout: 2000 });
    t.after(() => connection.destroy());
    const error = await new Promise(resolve => connection.connect(resolve));
    assert.equal(error?.code, 'MYSQL_CLEAR_PASSWORD_NOT_ENABLED');
    assert.equal(switchSent, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(received.length, 1, 'only the initial hashed handshake was sent');
    assert.equal(Buffer.concat(received).includes(Buffer.from(password)), false);
  });
}
