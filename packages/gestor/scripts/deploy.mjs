#!/usr/bin/env node

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

function run(command, args, options = {}) {
  const useShell = process.platform === "win32";
  const result = useShell
    ? spawnSync([command, ...args].join(" "), [], {
        cwd: projectRoot,
        stdio: "inherit",
        shell: true,
        ...options,
      })
    : spawnSync(command, args, {
        cwd: projectRoot,
        stdio: "inherit",
        shell: false,
        ...options,
      });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    const commandText = [command, ...args].join(" ");
    throw new Error(`Comando falhou: ${commandText}`);
  }
}

const versionStatePath = path.join(projectRoot, ".deploy-version.json");

function readLastVersion() {
  if (!fs.existsSync(versionStatePath)) return { major: 1, minor: 0 };

  try {
    const state = JSON.parse(fs.readFileSync(versionStatePath, "utf8"));
    const major = Number(state.major);
    const minor = Number(state.minor);
    if (Number.isInteger(major) && Number.isInteger(minor) && major > 0 && minor >= 0) {
      return { major, minor };
    }
  } catch {
    // Se o arquivo de versão estiver inválido, volta para o início seguro.
  }

  return { major: 1, minor: 0 };
}

function nextVersion() {
  const last = readLastVersion();
  const version = { major: last.major, minor: last.minor + 1 };
  return {
    ...version,
    label: `gestor${version.major}.${version.minor}`,
  };
}

function saveVersion(version) {
  fs.writeFileSync(versionStatePath, JSON.stringify({
    major: version.major,
    minor: version.minor,
    lastVersion: version.label,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function archiveName(version) {
  return `${version.label}.zip`;
}

// Bumpa cache-busting de TODOS os assets estaticos (CSS, JS, icones, manifest)
// e o nome do cache do service worker pra minor version do deploy. Sem isso o
// browser / SW seguem servindo assets antigos mesmo apos deploy novo.
// Regra: qualquer `?v=<digitos>` em main.ejs e sw.js sobe pra ?v=<version>.
// Isso funciona pra style.css, node-migration.css, main.js, app-shell.js,
// favicon.*, apple-touch-icon-*, manifest.json — todos usam o mesmo padrao.
// Edita in-place; git status mostra as mudancas junto do commit.
function bumpAssetsCacheVersion(version) {
  const v = String(version.minor);
  const layoutPath = path.join(projectRoot, "src/views/layouts/main.ejs");
  const swPath = path.join(projectRoot, "public/sw.js");

  const bumpQueryVersion = (source) => source.replace(/\?v=\d+/g, `?v=${v}`);

  if (fs.existsSync(layoutPath)) {
    const original = fs.readFileSync(layoutPath, "utf8");
    const updated = bumpQueryVersion(original);
    if (updated !== original) {
      fs.writeFileSync(layoutPath, updated);
      const hits = (original.match(/\?v=\d+/g) || []).length;
      console.log(`🔁 Cache-busting em ${hits} asset(s) -> ?v=${v} (main.ejs)`);
    }
  }

  if (fs.existsSync(swPath)) {
    const original = fs.readFileSync(swPath, "utf8");
    const updated = bumpQueryVersion(original)
      .replace(/const CACHE = "gestor-v[^"]*";/, `const CACHE = "gestor-v${v}";`);
    if (updated !== original) {
      fs.writeFileSync(swPath, updated);
      console.log(`🔁 Service worker CACHE -> gestor-v${v} + assets bumpados (sw.js)`);
    }
  }
}

function cleanOldZipFiles() {
  const zipFiles = fs.readdirSync(projectRoot).filter((file) => file.toLowerCase().endsWith(".zip"));
  for (const file of zipFiles) {
    fs.unlinkSync(path.join(projectRoot, file));
    console.log(`🗑️  ZIP antigo removido: ${file}`);
  }
}

function shouldIncludeFile(relativePath) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (!normalized) return false;
  if (normalized.startsWith(".")) return false;
  if (normalized.includes("/node_modules/") || normalized.startsWith("node_modules/")) return false;
  if (normalized.includes("/.git/") || normalized.startsWith(".git/")) return false;
  if (normalized.includes("/.deploy/") || normalized.startsWith(".deploy/")) return false;
  if (normalized.toLowerCase().endsWith(".zip")) return false;
  if (normalized.toLowerCase().endsWith(".tar")) return false;
  if (normalized.toLowerCase().endsWith(".tgz")) return false;
  if (normalized.toLowerCase().endsWith(".tar.gz")) return false;
  return true;
}

function collectFiles() {
  const entries = [];
  const includeDirs = ["dist", "src", "public"];
  const includeFiles = [
    "package.json",
    "tsconfig.json",
    "schema-hostinger.sql",
    "README.md",
    // Configuração de instalação das dependências em produção.
    ".npmrc",
  ];

  function addFile(absPath, zipPath) {
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return;
    if (!shouldIncludeFile(zipPath)) return;
    entries.push({ absPath, zipPath: zipPath.replace(/\\/g, "/") });
  }

  function walk(dir, base) {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const absPath = path.join(dir, item);
      const zipPath = path.join(base, item);
      const stat = fs.statSync(absPath);
      if (stat.isDirectory()) walk(absPath, zipPath);
      else addFile(absPath, zipPath);
    }
  }

  for (const dir of includeDirs) {
    const absDir = path.join(projectRoot, dir);
    if (fs.existsSync(absDir)) {
      console.log(`📂 Incluindo ${dir}/...`);
      walk(absDir, dir);
    } else {
      console.log(`⚠️  ${dir}/ não encontrado, pulando...`);
    }
  }

  for (const file of includeFiles) {
    const absPath = path.join(projectRoot, file);
    if (fs.existsSync(absPath)) {
      console.log(`📄 Incluindo ${file}...`);
      addFile(absPath, file);
    } else {
      console.log(`⚠️  ${file} não encontrado, pulando...`);
    }
  }

  entries.push({ zipPath: "Procfile", content: Buffer.from("web: node dist/server.js\n") });
  console.log("🚀 Incluindo Procfile...");

  entries.sort((a, b) => a.zipPath.localeCompare(b.zipPath));
  return entries;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, date: dosDate };
}

function writeZip(zipPath, entries) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.zipPath, "utf8");
    const source = entry.content ?? fs.readFileSync(entry.absPath);
    const compressed = zlib.deflateRawSync(source, { level: 9 });
    const crc = crc32(source);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, nameBuffer, compressed);

    centralDirectory.push({
      nameBuffer,
      crc,
      compressedSize: compressed.length,
      size: source.length,
      offset,
      time,
      date,
    });

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralStart = offset;

  for (const entry of centralDirectory) {
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(entry.time, 12);
    centralHeader.writeUInt16LE(entry.date, 14);
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.size, 24);
    centralHeader.writeUInt16LE(entry.nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(entry.offset, 42);
    chunks.push(centralHeader, entry.nameBuffer);
    offset += centralHeader.length + entry.nameBuffer.length;
  }

  const centralSize = offset - centralStart;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralDirectory.length, 8);
  end.writeUInt16LE(centralDirectory.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  chunks.push(end);

  fs.writeFileSync(zipPath, Buffer.concat(chunks));
}

// Compila o TypeScript em dist/ usando as dependências instaladas com npm ci.
function buildProject() {
  run("npm", ["run", "build"]);
}

function createDeploy() {
  console.log("🚀 Iniciando processo de deploy ZIP para Hostinger...\n");

  // Precisa vir ANTES do build pra que o layout compilado ja carregue os
  // assets com a query nova; o SW eh servido direto do public/, mas bumpando
  // aqui alinha CACHE name com a versao do deploy.
  const version = nextVersion();
  console.log(`\n🏷️  Versão automática: ${version.label}`);
  console.log("\n🧼 Bumpando cache-busting dos assets estaticos...");
  bumpAssetsCacheVersion(version);

  console.log("\n🔨 Gerando build TypeScript...");
  buildProject();

  console.log("\n🧹 Removendo ZIPs antigos da raiz do projeto...");
  cleanOldZipFiles();

  const name = archiveName(version);
  const outputPath = path.join(projectRoot, name);
  const entries = collectFiles();

  console.log(`\n📦 Criando arquivo: ${name}...`);
  writeZip(outputPath, entries);
  saveVersion(version);

  const fileSize = fs.statSync(outputPath).size;
  console.log("✅ Arquivo criado com sucesso!\n");
  console.log(`🏷️  Versão: ${version.label}`);
  console.log(`📍 Localização: ${outputPath}`);
  console.log(`📊 Tamanho: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📄 Total de arquivos: ${entries.length}`);
  console.log("📤 Faça upload deste .zip na Hostinger e reinicie o app Node.\n");
}

try {
  createDeploy();
} catch (error) {
  console.error("❌ Erro ao criar deploy:", error instanceof Error ? error.message : error);
  process.exit(1);
}
