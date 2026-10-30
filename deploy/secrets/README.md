# Secret Placeholders

Folder ini hanya menyimpan **contoh** secret dengan placeholder. File nyata tidak boleh
di-commit; `.gitignore` mengabaikan isi folder ini kecuali `README.md` dan `*.example`.

- Salin contoh ke nama tanpa `.example` hanya di mesin lokal atau saat deploy.
- Jangan menaruh password, token, kunci privat, atau kredensial nyata di repositori.
- File secret nyata harus memiliki permission ketat dan disuntik dari secret manager/file
  saat deploy.

Compose development WP-01 memakai placeholder dari `deploy/compose/.env.example`, bukan
secret produksi.
