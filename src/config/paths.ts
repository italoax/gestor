import path from 'node:path';
import { fileURLToPath } from 'node:url';

const compiled = /\/dist\/runtime\/src\/config\//.test(import.meta.url);
export const projectRoot = fileURLToPath(
  new URL(compiled ? '../../../../' : '../../', import.meta.url),
);
export const publicRoot = path.join(projectRoot, 'public');
export const viewsRoot = path.join(projectRoot, 'src/views');
