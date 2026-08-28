import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "..", "public", "assets");

if (existsSync(outDir)) {
  rmSync(outDir, { recursive: true, force: true });
}
mkdirSync(outDir, { recursive: true });
cpSync(join(root, "css", "site.css"), join(outDir, "site.css"));
cpSync(join(root, "js", "site.js"), join(outDir, "site.js"));
console.log("[web_src] built -> public/assets/");
