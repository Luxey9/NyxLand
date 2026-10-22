# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/),
versi mengikuti [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Ditambahkan
- Tab **Sholat** (hotkey `Alt+Y`): jadwal Subuh/Dzuhur/Ashar/Maghrib/Isya + hitung mundur ke waktu berikutnya
- Pengingat waktu sholat: banner notch + nada khusus saat masuk waktu, plus opsi pengingat sebelum waktu (5/10/15/20 menit)
- Sumber jadwal: Aladhan method **Kemenag** untuk Indonesia, MWL di luar Indonesia — ikut lokasi GPS/kota dari tab Cuaca, cache 6 jam
- Tombol "Pakai lokasi GPS" langsung di tab Sholat
- Notifikasi dari app sendiri (Sholat & pengingat tugas) pakai **ikon aplikasi** (rounded-square), bukan lagi lingkaran inisial

### Diperbaiki
- **Ikon notifikasi sistem akhirnya terisi** (WhatsApp, Chrome, Snipping Tool, Hermes, dll): ekstraksi 3 lapis — logo paket MSIX (dibaca dari manifest Appx) → proses yang cocok (cocok-nama pintar + path paket) → `ExtractAssociatedIcon` dari exe. Sebelumnya semua notifikasi jatuh ke ikon generik karena AppUserModelID gaya `…!App` ditebak jadi proses bernama "App".
- Cache ikon persisten (`notifications-icon-cache.json`) — ikon tetap muncul walau appnya sudah ditutup

## [1.0.0] — 2026-10-21

Rilis pertama dengan nama **NyxLand**.

### Ditambahkan
- Dynamic Island untuk Windows dengan mode notch / quick / large
- Notifikasi sistem masuk ke island, dengan aksi dan suara
- Reminder & tugas dengan parsing waktu (`@+15m`, `@14:30`)
- Banner notch, kartu popup, chip hitung mundur
- AI Assistant dengan streaming dan tool calling
- Pengaturan **Base URL / Model / API Key** dari dalam app
- Drag & drop file dan folder ke AI Assistant
- Batas context window (40 pesan, 9.000 karakter terkirim)
- Hapus per-pesan, hapus semua dengan undo, cari pesan
- Background image: URL remote, link Google Images, path lokal, atau file picker
- Validasi URL gambar (border merah kalau gagal load)
- `Esc` untuk memperkecil island ke notch dan menutup popup
- Audio Mixer, Quick Notes, Calendar, Weather, Battery Hub, Now Playing
- Progress Island universal

### Diubah
- Nama produk: Quick Pill → **NyxLand**
- Auto-updater dimatikan (build mandiri)
- Bundle diringankan: `node_modules` dibuang dari asar (62 MB → 5,6 MB)

### Keamanan
- API key tidak pernah dikirim ke renderer
- Mask key hanya menampilkan titik
- File config ditulis dengan permission owner-only
