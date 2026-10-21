import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// Set the environment BEFORE test modules can import dotenv or application pools.
// Keep only OS variables; never inherit SQL/provider credentials or Node preloads.
mkdirSync('.local/audits', { recursive: true });
const directory = mkdtempSync(path.resolve('.local/audits/isolated-tests-'));
const config = path.join(directory, 'test.security.env');
writeFileSync(config, '', { flag: 'wx', mode: 0o600 });
const os = Object.fromEntries(
  Object.entries(process.env).filter(([name]) =>
    /^(systemroot|windir|path|pathext|temp|tmp|comspec|userprofile|appdata|localappdata|number_of_processors|processor_architecture)$/i.test(
      name,
    ),
  ),
);
const files = process.argv.slice(2);
if (!files.length) {
  for (const group of ['unit', 'integration', 'security']) {
    for (const entry of readdirSync(path.join('test', group)))
      if (entry.endsWith('.test.mts'))
        files.push(path.join('test', group, entry));
  }
}
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', '--test', '--test-concurrency=2', ...files],
  {
    stdio: 'inherit',
    windowsHide: true,
    env: {
      ...os,
      GESTOR_ENV_FILE: config,
      NODE_ENV: 'development',
      DB_HOST: '127.0.0.1',
      DB_PORT: '9',
      DB_NAME: 'gestor_test_no_service',
      DB_USER: 'synthetic',
      DB_PASSWORD: 'synthetic-test-only',
      DB_SSL: 'false',
      RUN_AUTOMATIONS: 'false',
      SESSION_SECRET: 'isolated-tests-synthetic-session-secret',
    },
  },
);
process.exitCode = result.status ?? 1;
