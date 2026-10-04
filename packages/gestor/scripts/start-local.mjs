import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
process.chdir(projectRoot);
process.env.LOCAL_MODE = "false";
process.env.NODE_ENV = process.env.NODE_ENV || "production";
process.env.HOST = "127.0.0.1";
process.env.PORT = process.env.PORT || "80";
process.env.APP_URL = Number(process.env.PORT) === 80
  ? "http://localhost"
  : `http://localhost:${process.env.PORT}`;
// O acesso local usa HTTP, mesmo com as rotinas de produção habilitadas.
process.env.COOKIE_SECURE = "false";

await import(new URL("../dist/server.js", import.meta.url).href);
