# osc_site

OmniSight adalah workspace Next.js App Router yang responsif. Komponen di `src/components/ui` mengikuti pola komposisi Radix dan Tailwind seperti shadcn/ui; token global memakai Tailwind CSS v4.

## Konfigurasi

- `BACKEND_URL`: URL privat sisi server untuk `osc_rest`, misalnya `http://osc_rest:8080`. Jangan pernah mengeksposnya sebagai nilai `NEXT_PUBLIC_*`.
- `APP_ORIGIN`: origin publik persis yang dipakai pemeriksaan same-origin BFF, misalnya `https://ops.example.internal`. Atur ke origin yang terlihat browser di balik reverse proxy.

Login dan context switcher menyediakan dua perusahaan contoh dari `osc_base/seeds/001_initial_seed.sql`, serta field UUID untuk perusahaan yang diberikan administrator. ID regional juga dapat dimasukkan manual. Backend tetap bertanggung jawab memvalidasi seluruh akses perusahaan dan regional.

## Batas sesi dan API

BFF menyimpan token akses dan tantangan MFA berumur pendek dalam cookie `Secure; HttpOnly; SameSite=Strict`. Komponen browser yang terautentikasi memanggil route handler lokal; hanya handler tersebut yang meneruskan token cookie ke `osc_rest`. JWT tidak pernah dikembalikan di respons JSON atau disimpan dalam penyimpanan browser. Rute yang mengubah state memeriksa header `Origin` terhadap `APP_ORIGIN`.

UI memuat navigasi dari `/api/me/navigation`, yang meneruskan daftar efektif `can_view` dari backend. Proxy API untuk PAM authorize, transfer lampiran SOP, dan ekspor laporan juga menjaga access token di sisi server serta membatasi metode, identifier, MIME, dan tabel laporan yang diterima.

## Batas backend saat ini

- CT01 dan OP02 saat ini menampilkan telemetri contoh karena endpoint baca terkait belum tersedia di `osc_rest`.
- Pengeditan Markdown SOP adalah pratinjau lokal; layanan REST saat ini menyediakan transfer lampiran, tetapi belum menyediakan CRUD dokumen atau rute approval.
- SA01–SA04 menampilkan formulir modul, tetapi penulisan dinonaktifkan sampai endpoint administrasi terkait tersedia.
- Menu konteks perusahaan berisi opsi contoh dari seed dan input UUID manual karena REST belum menyediakan endpoint direktori company/area yang dibatasi grant pengguna.

UI tidak pernah menganggap navigasi tersembunyi sebagai otorisasi. Pemeriksaan rute backend dan RLS tetap menjadi sumber keputusan otoritatif.
