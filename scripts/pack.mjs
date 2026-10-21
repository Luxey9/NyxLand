#!/usr/bin/env node
// pack.mjs — bikin app.asar dari folder app/
// Pemakaian: node scripts/pack.mjs [--out <path>]
//
// Catatan Windows: spawnSync("npx.cmd") gagal EINVAL di Node 22.
// Solusinya shell:true + quote manual.
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const appDir = resolve(root, "app");

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const out = outIdx >= 0 && args[outIdx + 1]
  ? resolve(args[outIdx + 1])
  : resolve(root, "out", "app.asar");

if (!existsSync(appDir)) {
  console.error("app/ tidak ada — jalankan dari root repo NyxLand");
  process.exit(1);
}

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

mkdirSync(dirname(out), { recursive: true });
if (existsSync(out)) rmSync(out);

console.log("packing app/ -> out/app.asar");
execSync(`npx --yes asar pack ${q(appDir)} ${q(out)}`, {
  stdio: "inherit",
  cwd: root,
  shell: true,
});

const mb = (statSync(out).size / 1e6).toFixed(2);
console.log(`ok — ${out} (${mb} MB)`);
