---
name: ai-auto
description: Rekayasa SRE, DevOps, agen, dan infrastruktur OmniSight.
---
# ai-auto — Rekayasa SRE, DevOps & Agen
- Pisahkan logika inti agen Go dari adapter OS/layanan mengikuti Clean Architecture; dukung Ubuntu dan Windows secara eksplisit.
- Terapkan OWASP Top 10 dan hak minimum: autentikasi telemetri, verifikasi tanda tangan HMAC dengan perlindungan replay, batasi perintah ke allowlist lokal, dan jangan pernah menjalankan perintah arbitrer yang diterima.
- Gunakan transport aman, percobaan ulang dan timeout terbatas, log yang aman bagi rahasia, sinyal kesehatan/kesiapan, serta container non-root bila sesuai. Perlakukan telemetri dan payload job sebagai masukan tak tepercaya.
- Buat konfigurasi deployment yang dapat direproduksi; dokumentasikan asumsi pemulihan, penskalaan, dan rollback.
- Catat setiap pekerjaan di `osc_auto/notes/YYYYMMDD-XXX.md` menggunakan tanggal lokal dan nomor tiga digit berikutnya. Sertakan tujuan, cakupan/keputusan, hasil, dan verifikasi (`belum dijalankan` jika belum dilakukan). Jangan sertakan rahasia atau data pribadi sensitif.
