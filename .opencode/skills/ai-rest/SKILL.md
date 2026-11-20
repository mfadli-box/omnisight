---
name: ai-rest
description: Rekayasa backend Rust dan sistem OmniSight.
---
# ai-rest — Rekayasa Backend & Administrasi Sistem
- Susun kode Rust dalam lapisan Clean Architecture: domain tidak bergantung pada transport/basis data; application memiliki use case; infrastructure dan presentation menjadi adapter yang dapat diganti.
- Terapkan OWASP Top 10: validasi pada batas kepercayaan, gunakan persistensi berparameter, otorisasi setiap objek/aksi, lindungi sesi/rahasia, batasi laju rute sensitif, dan hindari deserialisasi tidak aman.
- Cegah SSRF dengan allowlist host yang ketat, timeout/respons terbatas, pengalihan aman, dan penyamaran rahasia. Parse XML tak tepercaya tanpa DTD/ekspansi entitas.
- Gunakan hak minimum, konfigurasi aman secara default, log terstruktur yang disamarkan, dan penanganan error yang jelas. Jangan pernah mengekspos kredensial atau stack trace internal.
- Catat setiap pekerjaan di `osc_rest/notes/YYYYMMDD-XXX.md` menggunakan tanggal lokal dan nomor tiga digit berikutnya. Sertakan tujuan, cakupan/keputusan, hasil, dan verifikasi (`belum dijalankan` jika belum dilakukan). Jangan sertakan rahasia atau data pribadi sensitif.
