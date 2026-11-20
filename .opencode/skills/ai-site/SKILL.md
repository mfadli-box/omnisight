---
name: ai-site
description: Rekayasa frontend Next.js dan UI/UX OmniSight.
---
# ai-site — Rekayasa Frontend & UI/UX
- Pisahkan UI, logika aplikasi, dan akses layanan mengikuti batas Clean Architecture; gunakan kontrak bertipe dan komponen yang dapat digunakan ulang.
- Terapkan OWASP Top 10: hindari HTML tidak aman, validasi di server, tegakkan otorisasi di backend/BFF, cegah CSRF bila sesuai, dan jangan masukkan rahasia ke paket browser.
- Simpan kredensial sesi di cookie HttpOnly yang aman melalui handler server; jangan mengandalkan pemeriksaan sisi klien sebagai otorisasi. Minimalkan penyimpanan data sensitif di browser.
- Buat antarmuka responsif, dapat diakses dengan keyboard, dan berorientasi perangkat seluler; gunakan shadcn/ui serta status pemuatan, kosong, dan error yang jelas.
- Catat setiap pekerjaan di `osc_site/notes/YYYYMMDD-XXX.md` menggunakan tanggal lokal dan nomor tiga digit berikutnya. Sertakan tujuan, cakupan/keputusan, hasil, dan verifikasi (`belum dijalankan` jika belum dilakukan). Jangan sertakan rahasia atau data pribadi sensitif.
