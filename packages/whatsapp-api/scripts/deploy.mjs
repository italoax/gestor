#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const deployDir = path.join(projectRoot, ".deploy");
const archiveName = "gestor-whatsapp-api-deploy.zip";
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

// --- Gerador de ZIP puro em Node (sem dependências, igual ao do painel) ---
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

function collectEntries(dir, base = "") {
  const entries = [];
  for (const item of fs.readdirSync(dir)) {
    const absPath = path.join(dir, item);
    const zipPath = base ? `${base}/${item}` : item;
    if (fs.statSync(absPath).isDirectory()) {
      entries.push(...collectEntries(absPath, zipPath));
    } else {
      entries.push({ absPath, zipPath });
    }
  }
  return entries;
}

function writeZip(zipPath, entries) {
  const chunks = [];
  const centralDirectory = [];
  let offset = 0;
  const { time, date } = dosDateTime();

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.zipPath, "utf8");
    const source = fs.readFileSync(entry.absPath);
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
    centralDirectory.push({ nameBuffer, crc, compressedSize: compressed.length, size: source.length, offset, time, date });
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
  // Entradas com caminho relativo (sem "./") para a Hostinger achar o package.json na raiz.
  const entries = collectEntries(deployDir).sort((a, b) => a.zipPath.localeCompare(b.zipPath));
  writeZip(archivePath, entries);

  const size = fs.statSync(archivePath).size;
  console.log("✅ Arquivo criado com sucesso!");
  console.log(`📍 Localização: ${archivePath}`);
  console.log(`📊 Tamanho: ${(size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`📄 Total de arquivos: ${entries.length}`);

  fs.rmSync(deployDir, { recursive: true, force: true });
} catch (error) {
  console.error("❌ Erro ao criar deploy:", error instanceof Error ? error.message : error);
  process.exit(1);
}
