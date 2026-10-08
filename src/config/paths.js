import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const publicRoot = path.join(projectRoot, 'public');
export const viewsRoot = path.join(projectRoot, 'src/views');
