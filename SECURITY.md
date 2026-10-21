# Keamanan

## Melaporkan celah

Buka issue dengan label `security`, atau hubungi maintainer langsung kalau sifatnya sensitif.

Jangan buka issue publik yang memuat detail eksploit atau data pribadi.

## Soal API key

NyxLand **tidak pernah** menyimpan API key di dalam aplikasi atau repo.

- Key disimpan di `%APPDATA%\NyxLand\ai-config.json`, permission `0600`
- Key tidak pernah dikirim ke renderer — yang ditampilkan hanya mask titik-titik
- Key tidak pernah masuk ke log
- `ai-config.json` masuk `.gitignore`

Kalau kamu menemukan key yang bocor di repo atau release, lapor segera.
