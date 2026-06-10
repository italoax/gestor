#!/usr/bin/env node
// Copia o pacote compartilhado (packages/shared) para dentro de cada app,
// em packages/<app>/src/shared/. Assim cada app fica self-contained no deploy
// (o zip da Hostinger não precisa resolver um pacote interno via npm install).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const sharedDir = path.join(repoRoot, "packages", "shared");

// Arquivos do shared que devem ser copiados (ignora package.json/node_modules).
const sharedFiles = fs
  .readdirSync(sharedDir)
  .filter((file) => file.endsWith(".js") || file.endsWith(".d.ts"));

const targets = [
  path.join(repoRoot, "packages", "gestor", "src", "shared"),
  path.join(repoRoot, "packages", "whatsapp-api", "src", "shared"),
];

for (const target of targets) {
  fs.mkdirSync(target, { recursive: true });
  for (const file of sharedFiles) {
    fs.copyFileSync(path.join(sharedDir, file), path.join(target, file));
  }
  console.log(`🔄 shared sincronizado -> ${path.relative(repoRoot, target)}`);
}
