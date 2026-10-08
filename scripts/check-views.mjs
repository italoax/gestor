import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ejs from 'ejs';
import { viewsRoot } from '../src/config/paths.js';

function checkViews(directory) {
  let count = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      count += checkViews(file);
    } else if (entry.isFile() && file.endsWith('.ejs')) {
      ejs.compile(readFileSync(file, 'utf8'), { filename: file });
      count++;
    }
  }
  return count;
}

console.log('Templates EJS verificados: ' + checkViews(viewsRoot));
