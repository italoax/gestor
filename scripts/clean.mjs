import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Remove only compiler output.
rmSync(fileURLToPath(new URL('../dist/', import.meta.url)), { recursive: true, force: true });
