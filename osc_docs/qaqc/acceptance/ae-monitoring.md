# UAT Modul AE Monitoring Infrastruktur

Status: Disetujui (0.6)

## 1. Cakupan

Enrollment agent, heartbeat, metrik host dan container, alert, insiden, integrasi LibreNMS dan Wazuh, serta retensi metrik.

## 2. Prasyarat

- Collector dan satu agent host pada area uji.
- Stub Wazuh dan LibreNMS.
- Ambang alert yang dapat dipicu dengan data sintetis.
- Skenario global `UAT-G-01` sampai `UAT-G-11` berlaku untuk modul ini.

## 3. Skenario

| ID | Skenario | Peran/scope | Langkah ringkas | Hasil yang diharapkan | Rujukan |
|---|---|---|---|---|---|
| UAT-AE-01 | Enrollment agent | admin dan agent | Buat token sekali pakai; enroll agent; ulangi token yang sama; coba token kedaluwarsa | Enroll pertama berhasil dan sertifikat diterbitkan; token bekas dan kedaluwarsa ditolak; tidak ada port masuk ke agent | AG-F-01 |
| UAT-AE-02 | Heartbeat dan metrik | noc_operator | Jalankan agent; hentikan agent; tunggu ambang offline | Heartbeat dan metrik muncul; setelah offline, alert dibuat; status agent berubah di UI | AG-F-02, AG-F-03, FE-F-08 |
| UAT-AE-03 | Isolasi host | noc_operator area A | Buka host area A; ganti ID ke host area B | Host area A terlihat; host area B `AA00-00-0004`; grafik tidak memuat data lintas area | BE-F-05, DB-F-02 |
| UAT-AE-04 | Alert dan notifikasi | noc_operator | Picu ambang alert; ulangi event yang sama; resolve | Alert dibuat sekali dengan deduplikasi; notifikasi terkirim sesuai kanal; resolve tercatat; tidak ada spam | BE-F-06, BE-F-09, FE-F-11 |
| UAT-AE-05 | Alur insiden | noc_operator | Acknowledge, assign, komentar, resolve | Status dan timeline benar; assign hanya ke anggota; audit memuat aktor dan perubahan status | BE-F-06, BE-F-09 |
| UAT-AE-06 | Payload dan buffer | agent | Putuskan jaringan; biarkan buffer terisi; sambungkan kembali | Payload tidak memuat environment atau rahasia; buffer mengirim berurutan; data tertua dihapus saat penuh dengan catatan | AG-F-03, AG-F-09 |
| UAT-AE-07 | Wazuh active response | noc_operator dan approver | Picu kejadian; minta active response; coba self-approval; setujui dan eksekusi | Active response memerlukan `AE06:post`, MFA, dan approval; self-approval ditolak; hasil dan alasan tercatat | BE-F-07, BE-F-10, FE-F-07 |
| UAT-AE-08 | Retensi dan rollup | admin | Query metrik mentah yang sudah kedaluwarsa; query rollup | Metrik mentah kedaluwarsa tidak tersedia; rollup tetap ada sesuai kebijakan; tidak ada error 5xx | DB-F-07, BE-F-06 |
| UAT-AE-09 | Batch tidak sah | agent | Kirim signature salah, nonce berulang, dan timestamp di luar jendela | Collector menolak batch; agent mencoba ulang dengan backoff; tidak ada data masuk; kejadian tercatat | AG-F-02, AG-F-09 |
| UAT-AE-10 | Bahasa dan grafik kosong | viewer | Buka metrik tanpa data; ganti bahasa | Empty state dan label terlokalisasi; tidak ada error; kode tetap | BE-F-12, FE-F-08, FE-F-12 |

## 4. Kriteria lulus

- Agent yang dicabut tidak dapat heartbeat atau mengirim metrik.
- Alert tidak duplikat dan dapat di-resolve dengan jejak audit.
- Metrik tidak memuat rahasia atau data pribadi.
- Data metrik selalu terikat perusahaan dan area.
- Seluruh skenario global yang relevan berstatus `Lulus`.
- Tidak ada temuan S1 atau S2; temuan S3 ditutup atau disetujui risikonya.
- Bukti tersimpan dan audit event dapat ditemukan dari `request_id`.

## 5. Bukti yang dikumpulkan

- Screenshot atau rekaman layar untuk alur utama dan penolakan.
- `request_id` dan ID audit untuk setiap aksi tulis.
- Kutipan respons envelope untuk kasus negatif.
- Hasil ekspor atau unduhan yang diuji, bila ada.
- Catatan versi build, migrasi, dan katalog bahasa.

## 6. Rujukan fungsi

`AG-F-01`, `AG-F-02`, `AG-F-03`, `AG-F-09`, `BE-F-05`, `BE-F-06`, `BE-F-07`, `BE-F-09`, `BE-F-10`, `BE-F-12`, `DB-F-02`, `DB-F-07`, `FE-F-07`, `FE-F-08`, `FE-F-11`, `FE-F-12`
