# MP-CM02-FE — Pemilihan tenant dan matriks izin

## Objektif

Memudahkan pencarian perusahaan atau area berdasarkan nama serta penyuntingan lima izin per modul.

## Scope/Keputusan

Komponen CM memakai ulang combobox Base UI yang juga dipakai saat login. Pencarian mencocokkan urutan karakter pada nama dan keterangan, mengabaikan kapitalisasi serta diakritik. ID dipakai untuk identitas pilihan. Matriks menerima baris dari komponen induk dan mengirim perubahan melalui `onChange(menuId, action, enabled)`. Komponen induk mengelola nilai terbaru dan penyimpanan.

## Hasil Eksekusi

Komponen tersedia di `src/components/cm/SearchableCombobox.tsx` dan `src/components/cm/PermissionMatrixGrid.tsx`. Setiap sakelar memiliki nama aksesibel yang memuat aksi dan nama modul.

## Status Verifikasi

- `passed` — Pemeriksaan logika pencarian mencakup singkatan, kapitalisasi, diakritik, keterangan area, kueri kosong, dan kueri tanpa hasil.
- `passed` — Pemeriksaan komponen mengaktifkan dan menonaktifkan kelima izin, memeriksa parameter callback dan status sakelar setelah render ulang, serta memeriksa tampilan kosong dan ketiadaan ID pada markup matriks.
- `not run` — Uji interaksi melalui peramban.

Build produksi Next.js (`npm run build`) berstatus `passed`, termasuk pemeriksaan tipe TypeScript.
