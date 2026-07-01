/**
 * Ejecuta Playwright con navegadores en frontend-react/.playwright-browsers
 * (evita depender de %LOCALAPPDATA%/ms-playwright).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, ".playwright-browsers");

const args = process.argv.slice(2);
const bin =
  process.platform === "win32"
    ? path.join(root, "node_modules", ".bin", "playwright.cmd")
    : path.join(root, "node_modules", ".bin", "playwright");

const result = spawnSync(bin, args, {
  stdio: "inherit",
  env: process.env,
  cwd: root,
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
