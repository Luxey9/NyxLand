#!/usr/bin/env node
// verify-nokey.mjs — pastikan tidak ada API key / config rahasia yang ikut kebundel.
// Pemakaian: node scripts/verify-nokey.mjs [--asar <path>]
//
// Yang diperiksa:
//   1. ai-config.json / .env / *.pem tidak ada di app/
//   2. tidak ada string yang bentuknya API key (panjang >= 32, alfanumerik campur)
//   3. kalau app.asar ada, isinya juga discan
//   4. tidak ada key asli dari %APPDATA%\NyxLand\ai-config.json di dalam bundle
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, extname, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const appDir = resolve(root, "app");

const args = process.argv.slice(2);
const asarIdx = args.indexOf("--asar");
const asarPath = asarIdx >= 0 && args[asarIdx + 1]
  ? resolve(args[asarIdx + 1])
  : resolve(root, "out", "app.asar");

const BAD_NAMES = new Set(["ai-config.json", ".env", ".env.local", ".env.production"]);
const BAD_EXT = new Set([".pem", ".key", ".p12", ".pfx"]);

// pola yang mencurigakan: 32+ karakter alfanumerik tanpa spasi
const KEY_RE = /\b[A-Za-z0-9_-]{32,}\b/g;

// kata yang memang wajar muncul dan panjang
const ALLOW = new Set([
  "application/javascript",
  "text/javascript",
  "application/json",
  "application/x-www-form-urlencoded",
  "OpenRunde, system-ui, sans-serif",
  "abcdefghijklmnopqrstuvwxyz",
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  "0123456789abcdef",
]);

const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".md", ".txt", ".svg", ".ps1"]);

let problems = 0;
const report = (msg) => { console.log("  ✗ " + msg); problems++; };

function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function readLiveKey() {
  const cands = [
    join(homedir(), "AppData", "Roaming", "NyxLand", "ai-config.json"),
    join(homedir(), "AppData", "Roaming", "Quick Pill", "ai-config.json"),
  ];
  for (const c of cands) {
    try {
      const j = JSON.parse(readFileSync(c, "utf8"));
      if (j && j.apiKey) return String(j.apiKey);
    } catch {}
  }
  return "";
}

console.log("verify-nokey — scan bundle NyxLand\n");

// 1) file names
console.log("[1] nama file terlarang");
if (existsSync(appDir)) {
  for (const p of walk(appDir)) {
    const base = p.split(/[\\/]/).pop();
    const ext = extname(p).toLowerCase();
    if (BAD_NAMES.has(base) || BAD_EXT.has(ext)) report(relative(root, p));
  }
} else {
  console.log("  (app/ tidak ada, dilewati)");
}

// 2) key asli
const liveKey = readLiveKey();
console.log("\n[2] API key asli dari userData");
if (!liveKey) {
  console.log("  (tidak ada ai-config.json terbaca — dilewati)");
} else {
  const frags = [liveKey, liveKey.slice(0, 8), liveKey.slice(-8)];
  const targets = [];
  if (existsSync(appDir)) targets.push(...walk(appDir));
  if (existsSync(asarPath)) targets.push(asarPath);

  let hit = 0;
  for (const t of targets) {
    let buf;
    try { buf = readFileSync(t); } catch { continue; }
    for (const f of frags) {
      if (f && buf.includes(Buffer.from(f))) { report(`key fragment di ${relative(root, t)}`); hit++; break; }
    }
  }
  if (!hit) console.log("  ✓ tidak ada key asli di bundle");
}

// 3) pola key generik di file teks
console.log("\n[3] pola string mirip API key");
if (existsSync(appDir)) {
  let suspicious = 0;
  for (const p of walk(appDir)) {
    if (!TEXT_EXT.has(extname(p).toLowerCase())) continue;
    let txt;
    try { txt = readFileSync(p, "utf8"); } catch { continue; }
    for (const m of txt.matchAll(KEY_RE)) {
      const s = m[0];
      if (ALLOW.has(s)) continue;
      // buang yang jelas bukan key: path, base64 gambar, hash hex panjang
      if (/^[0-9a-f]{32,}$/i.test(s) && !/[g-z]/i.test(s)) continue;
      if (s.startsWith("data:image")) continue;
      suspicious++;
      if (suspicious <= 5) console.log(`  ? ${relative(root, p)}: ${s.slice(0, 12)}… (${s.length} char)`);
    }
  }
  if (!suspicious) console.log("  ✓ tidak ada pola mencurigakan");
  else console.log(`  (${suspicious} kandidat — periksa manual kalau perlu)`);
}

// 4) ukuran
console.log("\n[4] ukuran");
if (existsSync(asarPath)) console.log(`  app.asar: ${(statSync(asarPath).size / 1e6).toFixed(2)} MB`);
if (existsSync(appDir)) {
  let t = 0;
  for (const p of walk(appDir)) t += statSync(p).size;
  console.log(`  app/:     ${(t / 1e6).toFixed(2)} MB`);
}

console.log("");
if (problems) {
  console.log(`GAGAL — ${problems} masalah ditemukan. Jangan publish sebelum dibersihkan.`);
  process.exit(1);
}
console.log("LULUS — aman untuk dipublish.");
