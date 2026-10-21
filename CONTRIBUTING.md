# Kontribusi

Terima kasih sudah mau ikut ngembangin NyxLand.

## Alur

1. Fork repo
2. Buat branch: `git checkout -b fitur/nama-fitur`
3. Commit: `git commit -m "feat: tambah X"`
4. Push: `git push origin fitur/nama-fitur`
5. Buka Pull Request

## Aturan commit

Pakai [Conventional Commits](https://www.conventionalcommits.org/):

```
feat:     fitur baru
fix:      perbaikan bug
perf:     optimasi
refactor: ubah struktur tanpa ubah perilaku
docs:     dokumentasi
chore:    tooling, build
```

## Sebelum push

```bash
npm run verify
```

Ini mastiin nggak ada API key atau file rahasia yang ikut ke-commit.

## Jangan pernah commit

- `ai-config.json`
- `.env` apa pun
- API key, token, password
- `app.asar` hasil build

Semua sudah masuk `.gitignore`. Kalau kamu nemu file kayak gitu di repo, lapor lewat issue.
