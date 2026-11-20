# Cetak Biru Reengineering Aplikasi

> Templat yang dapat digunakan ulang. Ganti setiap instruksi dalam tanda kurung siku; jangan mengasumsikan perilaku sistem sasaran tanpa bukti.

## 1. Kendali dokumen
- Aplikasi dan versinya: [nama/versi]
- Repositori sumber dan lisensi: [URL/lisensi]
- Tanggal/penanggung jawab penilaian: [tanggal/peran]
- Status: [draf/ditinjau/disetujui]
- Dokumen perencanaan, topology, dan keputusan terkait: [tautan]

## 2. Tujuan dan batas
- Hasil bisnis: [hasil yang terukur]
- Termasuk dalam cakupan: [kapabilitas]
- Di luar cakupan: [pengecualian eksplisit]
- Batasan dan asumsi: [batasan; tandai asumsi yang belum diverifikasi]
- Ukuran keberhasilan: [metrik yang dapat diamati]

## 3. Bukti dan penilaian kondisi saat ini
Untuk setiap temuan, catat sumber, revisi/tanggal, tingkat keyakinan, dan implikasinya.
- Kapabilitas produk dan alur pengguna: [bukti]
- Arsitektur, deployment, dependensi, dan integrasi: [bukti]
- Model data, kepemilikan, retensi, dan kebutuhan migrasi: [bukti]
- Kontrol operasi/keamanan saat ini dan celah yang diketahui: [bukti]
- Kewajiban lisensi dan dependensi pihak ketiga: [bukti]

## 4. Kebutuhan dan kontrak
- Persona, role, dan cerita pengguna: [cerita + kriteria penerimaan]
- Kebutuhan fungsional: [ID dan kriteria penerimaan]
- Kebutuhan nonfungsional: [ketersediaan, latensi, skala, aksesibilitas, pemulihan]
- Kontrak API/kejadian dan kebijakan kompatibilitas: [skema/versi]
- Kontrak impor/ekspor dan migrasi data: [pemetaan, validasi, rollback]

## 5. Arsitektur sasaran
- Gaya arsitektur dan batas Clean Architecture: [domain/use case/adapter]
- Diagram konteks dan container: [tautan]
- Tanggung jawab layanan dan batas kepercayaan: [rincian]
- Persistensi, cache, object storage, dan pencarian: [keputusan]
- Topology deployment dan model skala: [satu/beberapa node]
- Keputusan arsitektur (tautan ADR): [keputusan, alternatif, alasan]

## 6. Keamanan dan privasi
Buat model ancaman untuk setiap batas kepercayaan dan aliran data.
- Aset, aktor, titik masuk, dan kasus penyalahgunaan: [tabel/tautan]
- Risiko OWASP Top 10 dan mitigasi: [risiko → kontrol → verifikasi]
- Autentikasi, otorisasi, isolasi tenant, dan audit: [kebutuhan]
- Secret, enkripsi, rotasi kunci, logging, dan retensi: [kontrol]
- Kontrol rantai pasok, container, dan dependensi: [kontrol]
- Uji penerimaan keamanan dan risiko residual: [bukti]

## 7. Strategi reengineering dan migrasi
- Keputusan tiap kapabilitas (gunakan kembali/ganti/hentikan): [matriks]
- Urutan delivery bertahap dan dependensi: [fase]
- Latihan migrasi data, rekonsiliasi, cutover, dan rollback: [langkah]
- Rencana koeksistensi, kompatibilitas, dan penghentian: [langkah]
- Kesiapan operasional dan serah terima kepemilikan: [daftar periksa]

## 8. Rencana penyampaian dan prompt kerja
Untuk setiap paket kerja, sertakan: skill/peran pemilik, masukan, cakupan terbatas, dependensi, berkas hasil, kriteria penerimaan, kriteria keamanan, perintah/bukti verifikasi, dan catatan serah terima.
1. Inventarisasi penemuan dan bukti: [prompt + kriteria]
2. Kebutuhan dan model ancaman: [prompt + kriteria]
3. Kontrak data dan API: [prompt + kriteria]
4. Infrastruktur dan irisan backend vertikal: [prompt + kriteria]
5. Frontend dan integrasi: [prompt + kriteria]
6. QA, tinjauan keamanan, latihan migrasi, dan dokumentasi: [prompt + kriteria]

## 9. Strategi verifikasi
- Cakupan unit, integrasi, kontrak, end-to-end, kinerja, aksesibilitas, dan keamanan: [cakupan]
- Lingkungan uji, data sintetis, dan kebijakan secret: [rincian]
- Gerbang rilis dan lokasi bukti: [kriteria/lokasi]
- Celah yang diketahui dan pemeriksaan yang belum dijalankan secara eksplisit: [daftar]

## 10. Dokumentasi operasi dan pengguna
- SLO, dashboard, peringatan, piket, backup/restore, dan pemulihan bencana: [tautan]
- Panduan instalasi, konfigurasi, upgrade, pemecahan masalah, dan rollback: [tautan]
- Role pengguna, alur umum, aksesibilitas, dan jalur dukungan: [tautan]

## 11. Risiko, keputusan, dan pertanyaan terbuka
| ID | Item | Kemungkinan/dampak | Pemilik | Mitigasi atau tanggal keputusan | Status |
|---|---|---|---|---|---|
| R-001 | [risiko/pertanyaan] | [tingkat] | [peran] | [tindakan/tanggal] | [terbuka] |

## 12. Tinjauan dan penyelesaian
- [ ] Temuan memiliki bukti yang dapat ditelusuri dan label tingkat keyakinan.
- [ ] Kebutuhan dipetakan ke arsitektur dan verifikasi.
- [ ] Ancaman, batas tenant, migrasi, pemulihan, dan rollback telah dibahas.
- [ ] Tidak ada secret atau data pribadi sensitif dalam dokumen ini.
- [ ] Peninjau dan bukti persetujuan: [nama/peran/tanggal]
