#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const deployDir = path.join(projectRoot, ".deploy");
const archiveName = "gestor-whatsapp-api-deploy.tar.gz";
const archivePath = path.join(projectRoot, archiveName);

function run(command, args, options = {}) {
  const useShell = process.platform === "win32";
  const result = useShell
    ? spawnSync([command, ...args].join(" "), [], { cwd: projectRoot, stdio: "inherit", shell: true, ...options })
    : spawnSync(command, args, { cwd: projectRoot, stdio: "inherit", shell: false, ...options });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Comando falhou: ${[command, ...args].join(" ")}`);
}

function copy(src, dest = src) {
  const srcPath = path.join(projectRoot, src);
  const destPath = path.join(deployDir, dest);
  if (!fs.existsSync(srcPath)) {
    console.log(`⚠️  ${src} não encontrado, pulando...`);
    return;
  }
  if (fs.statSync(srcPath).isDirectory()) {
    console.log(`📂 Copiando ${src}/...`);
    fs.cpSync(srcPath, destPath, { recursive: true });
  } else {
    console.log(`📄 Copiando ${src}...`);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.copyFileSync(srcPath, destPath);
  }
}

try {
  console.log("🚀 Gerando pacote da API WhatsApp...\n");

  console.log("🔄 Sincronizando pacote compartilhado (shared)...");
  run("node", ["../../scripts/sync-shared.mjs"]);

  run("npm", ["test"]);

  if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath);
  if (fs.existsSync(deployDir)) fs.rmSync(deployDir, { recursive: true, force: true });
  fs.mkdirSync(deployDir, { recursive: true });

  copy("src");
  copy("package.json");
  copy("package-lock.json");
  copy("README.md");
  copy(".env.example");

  fs.writeFileSync(path.join(deployDir, "Procfile"), "web: node src/server.js\n");
  console.log("🚀 Arquivo Procfile criado...");

  console.log(`\n📦 Criando arquivo: ${archiveName}...`);
  // Lista os itens pelo nome (sem o prefixo "./" que o `tar .` adiciona) para que
  // o package.json fique na raiz do pacote — senão a Hostinger não detecta o projeto.
  const items = fs.readdirSync(deployDir);
  run("tar", ["-czf", `../${archiveName}`, ...items], { cwd: deployDir });

  const size = fs.statSync(archivePath).size;
  console.log("✅ Arquivo criado com sucesso!");
  console.log(`📍 Localização: ${archivePath}`);
  console.log(`📊 Tamanho: ${(size / 1024 / 1024).toFixed(2)} MB`);

  fs.rmSync(deployDir, { recursive: true, force: true });
} catch (error) {
  console.error("❌ Erro ao criar deploy:", error instanceof Error ? error.message : error);
  process.exit(1);
}
