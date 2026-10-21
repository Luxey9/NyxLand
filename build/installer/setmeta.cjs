#!/usr/bin/env node
// setmeta.cjs — tulis ulang metadata + ikon resource .exe Electron.
// Tanpa ini, exe hasil rename masih tertulis ProductName/CompanyName upstream.
//
// Pemakaian:
//   node build/installer/setmeta.cjs <path-exe> <path-ico>
// Butuh: npm i --no-audit --no-fund rcedit@4

const path = require("node:path");
const fs = require("node:fs");

const exe = process.argv[2];
const icon = process.argv[3];
if (!exe || !fs.existsSync(exe)) {
  console.error("pakai: node setmeta.cjs <exe> <ico>");
  process.exit(1);
}

const rcedit = require(path.resolve(__dirname, "../../node_modules/rcedit"));
const pkg = require(path.resolve(__dirname, "../../package.json"));

const version = `${pkg.version.replace(/[^\d.].*$/, "")}.0`
  .split(".")
  .slice(0, 4)
  .join(".");

rcedit(exe, {
  "version-string": {
    CompanyName: pkg.author?.name || "NyxLand",
    FileDescription: pkg.description || "NyxLand",
    ProductName: pkg.productName || pkg.name,
    LegalCopyright: `Copyright © ${new Date().getFullYear()} ${pkg.author?.name || "NyxLand"}`,
    OriginalFilename: path.basename(exe),
    InternalName: pkg.productName || pkg.name,
  },
  "file-version": version,
  "product-version": version,
  ...(icon && fs.existsSync(icon) ? { icon } : {}),
})
  .then(() => console.log(`ok — ${exe} (v${version})`))
  .catch((e) => {
    console.error("gagal:", e.message);
    process.exit(1);
  });
