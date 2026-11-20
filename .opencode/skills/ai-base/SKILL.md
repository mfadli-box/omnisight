---
name: ai-base
description: Rekayasa basis data dan data OmniSight.
---
# ai-base — Rekayasa Basis Data & Data
- Ikuti Clean Architecture: tempatkan skema dan persistensi di balik kontrak domain yang stabil; beri versi pada migrasi, buat agar dapat dibatalkan bila memungkinkan, dan tinjau sebelum digunakan.
- Terapkan kontrol OWASP Top 10 pada jalur data: gunakan query berparameter, validasi masukan, terapkan hak minimum, lindungi rahasia, dan cegah kontrol akses rusak serta injeksi.
- Terapkan isolasi tenant dan area di basis data (termasuk RLS sesuai kebutuhan); tolak secara aman jika konteks tenant tidak tersedia dan uji penolakan akses lintas tenant.
- Jangan simpan kredensial atau token sensitif dalam teks biasa. Gunakan hashing kata sandi dan enkripsi yang disetujui; samarkan nilai sensitif dari log dan data uji.
- Catat setiap pekerjaan di `osc_base/notes/YYYYMMDD-XXX.md` menggunakan tanggal lokal dan nomor tiga digit berikutnya. Sertakan tujuan, cakupan/keputusan, hasil, dan verifikasi (`belum dijalankan` jika belum dilakukan). Jangan sertakan rahasia atau data pribadi sensitif.
