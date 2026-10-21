# Bikin Installer `.exe` (NSIS) dari Build yang Sudah Jadi

Tidak perlu build dari source. Installer dibangun dari folder aplikasi Electron yang
sudah jadi (`win-unpacked`: runtime + `resources/app.asar`) memakai
`electron-builder --prepackaged`. Waktu build: **~40 detik**.

## Bahan

| Bahan | Catatan |
|---|---|
| Folder app siap-jalan | hasil `electron-packager`/`electron-forge`, atau rename manual `quick-pill.exe` → `NyxLand.exe` |
| Node.js 22 + npm 10 | `node -v` |
| `electron-builder@26` | `npm i --no-audit --no-fund electron-builder@26` (±88 MB, sekali) |
| `rcedit@4` | ganti metadata + ikon `.exe`, `npm i --no-audit --no-fund rcedit@4` |
| Internet sekali | electron-builder mengunduh `nsis-3.0.4.1.7z`, `nsis-resources`, `7zip` (±4 MB) lalu di-cache di `%LOCALAPPDATA%\electron-builder\Cache` |

Tidak butuh: makensis manual, Visual Studio, Python, paket `electron` penuh,
`node_modules` proyek 400–600 MB, sertifikat code signing.

## Langkah

```bash
# 1. folder app jadi -> appdir/
cp -r <folder-app-jadi> appdir
rm -f appdir/BACA-INI.txt

# 2. metadata + ikon exe (sekali, hasilnya permanen di exe)
node scripts/setmeta.cjs appdir/NyxLand.exe build/icon.ico

# 3. bungkus
electron-builder --win nsis --prepackaged appdir
# -> dist/NyxLand-Setup-<versi>.exe
```

## Jebakan yang sudah ketemu

- **`Cannot compute electron version`** — dengan `--prepackaged`, electron-builder
  tidak bisa menebak versi dari `node_modules` yang kosong. Tulis manual:
  `electronVersion: 38.7.2` di config.
- **Metadata exe masih milik upstream** — `ProductName: Quick Pill`,
  `CompanyName: Abrar Nabil`. Klik kanan → Properties kelihatan. Wajib `rcedit`.
- **Ikon PNG tanpa alpha** — kalau sumber ikon masih RGB dengan background putih,
  sudut membulat jadi kotak putih. Proses: flood-fill putih dari tepi → transparan,
  erode silhouette 4 px untuk inti, alpha pita tepi dari luminance, unmix
  `C = (P − 255(1−a))/a`. Simpan `.ico` 9 ukuran (16–256).
- **Ikon harus dipasang di 3 tempat** biar tidak campur: resource `.exe` (`rcedit`),
  ikon installer/uninstaller NSIS, dan ikon window di dalam `app.asar`
  (`src/assets/icons/icon.ico` + `icon.png`).
- **`asar` versi baru ESM** — `require("@electron/asar")` gagal di Node 22;
  pakai CLI `node node_modules/@electron/asar/bin/asar.js list <file>`.

## Verifikasi (dipakai sebelum rilis)

```bash
# install senyap ke folder kosong
NyxLand-Setup-1.0.0.exe /S /D=C:\temp\install-test   # exit 0

# cek ikon yang benar-benar nempel di exe
powershell -c "Add-Type -AssemblyName System.Drawing; `
  $i=[System.Drawing.Icon]::ExtractAssociatedIcon('C:\temp\install-test\NyxLand.exe'); `
  $i.ToBitmap().Save('ico.png')"     # sudut harus alpha 0, bukan putih

# jalankan + cek runtime lewat CDP
# title: NyxLand | bg: none | aiCfg.hasKey: false

# uninstall senyap
"C:\temp\install-test\Uninstall NyxLand.exe" /S   # folder + shortcut + registry bersih
```

## Yang sengaja tidak dipasang

- **Code signing** — tanpa sertifikat OV ($200–400/tahun), SmartScreen tetap
  menampilkan "Unknown Publisher".
- **Auto-update** — butuh server rilis + komitmen maintain rilis berikutnya.
