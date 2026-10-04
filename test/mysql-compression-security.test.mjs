import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const sessionRequire = createRequire(require.resolve('express-mysql-session'));

for (const [name, loader] of [['panel', require], ['session store', sessionRequire]]) {
  const root = dirname(loader.resolve('mysql2/package.json'));
  const { enableCompression } = require(join(root, 'lib/compressed_protocol.js'));
  for (const claimedLength of [1024, 32768]) {
    test(`${name} caps inflated output to ${claimedLength} bytes`, { timeout: 3000 }, async () => {
      let networkError;
      let parsed = false;
      let completed;
      const result = new Promise(resolve => { completed = resolve; });
      const connection = {
        write() {},
        _bumpCompressedSequenceId() {},
        handlePacket() { parsed = true; },
        _handleNetworkError(error) { networkError = error; completed(); },
      };
      enableCompression(connection);
      // Small fixture covers both sync and async paths, not a real memory bomb.
      const compressed = deflateSync(Buffer.alloc(65536));
      connection._handleCompressedPacket({
        readInt24: () => claimedLength,
        readBuffer: () => compressed,
        numPackets: 1,
      });
      await result;
      assert.equal(networkError?.code, 'ERR_BUFFER_TOO_LARGE');
      assert.equal(parsed, false, 'oversized data never reaches packet parsing');
    });
  }
}
