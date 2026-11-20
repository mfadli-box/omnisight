# Suite Integrasi Alur Inti

`test_core_flows.py` adalah suite pytest black-box yang memakai Python 3.10+, pytest, dan `httpx` terhadap lingkungan OmniSight khusus pengujian yang dapat direset. Suite ini memeriksa REST dan RustFS dari ujung ke ujung. Kode TOTP dihitung dengan HMAC/base32 pustaka standar Python. Jalankan hanya pada data yang boleh direset: pengujian pemulihan MFA menghabiskan backup code, pengujian HRIS mengubah skenario upstream perusahaan uji, dan ekspor membuat objek arsip privat.

Untuk development, test, dan validation dengan Docker, jalankan `make up-dev` dari root repositori. Compose membuat bridge proyek dengan subnet `172.99.55.0/24`. Tetapkan `OMNISIGHT_TEST_API_URL=http://127.0.0.1:36664` untuk suite di bawah. Hentikan stack dengan `make down-dev` sebelum memakai subnet yang sama untuk proyek Compose lain pada host itu. Override ini memerlukan Docker Compose 2.24.4 atau yang lebih baru. [Dokumentasi penggabungan Compose](https://docs.docker.com/reference/compose-file/merge/#replace-value)

Jika host memakai bridge eksternal `blackbox` dengan subnet `172.99.0.0/16`, gunakan `make up-dev DEV_NETWORK=blackbox` dan `make down-dev DEV_NETWORK=blackbox`. Kelima layanan mendapat IP `172.99.55.11`–`172.99.55.15`. Jalankan satu stack OmniSight pada bridge bersama ini karena nama DNS layanan dan port host dipakai bersama.

```sh
python -m venv .venv
. .venv/bin/activate             # Windows: .venv\Scripts\Activate.ps1
python -m pip install -r osc_docs/test_flow/requirements.txt
pytest -q osc_docs/test_flow/test_core_flows.py
```

Arahkan `OMNISIGHT_TEST_API_URL` ke origin API (nilai bawaan `http://127.0.0.1:8080`). Gunakan hanya akun uji, database dan namespace Valkey khusus, serta bucket RustFS privat untuk pengujian. Jangan pernah memakai kredensial produksi. Kredensial diberikan melalui environment atau penyimpanan secret CI yang terlindungi, bukan melalui berkas `.env` yang dikomit.

## Controller fixture pengujian

Deployment uji dapat menyediakan `OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL` privat dengan endpoint `POST /scenario`. Ini adalah **infrastruktur pengujian, bukan endpoint produk OmniSight**. Controller mengatur fake HRIS terisolasi dan fixture database/Valkey. Batasi jaringan controller ke runner pengujian dan nonaktifkan di produksi. Nama skenario yang digunakan suite:

- `hris_success`: HRIS mengembalikan `<string>1|username|nama lengkap|email</string>` ber-namespace untuk company/pengguna yang diberikan.
- `hris_denied`: HRIS mengembalikan `0|...|NONE` untuk pengguna yang juga memiliki kata sandi lokal cache valid, agar pengujian membuktikan penolakan tidak memakai fallback.
- `hris_timeout`: kosongkan state breaker company uji, atur upstream menghasilkan timeout terkontrol, dan pertahankan satu pengguna yang baru disinkronkan serta satu pengguna dengan sinkronisasi kedaluwarsa.
- `expire_hris_sync`: atur waktu sinkronisasi akun uji agar lebih lama dari TTL company.
- `reset_mfa_enrollment_fixture`: nonaktifkan/reset MFA pengguna uji dan kosongkan counter Valkey-nya.
- Skenario suite keamanan: `ssrf_private_ip`, `ssrf_cloud_metadata`, `hris_xxe`, `hris_oversized_xml`, `reset_mfa_replay_fixture`, dan `age_mfa_verification`. Controller hanya boleh mengubah company uji, memakai respons fake HRIS lokal untuk kasus parser, mengosongkan state pembatas laju, dan tidak boleh membuat runner mengakses alamat privat/metadata. Uji SSRF lulus bila API menolak target sebelum akses jaringan. `age_mfa_verification` mengubah timestamp database fixture PAM menjadi lebih lama dari 15 menit setelah pengujian memperoleh sesi valid.

Controller hanya mengembalikan 2xx setelah skenario siap. Untuk skenario outage, XML, dan SSRF, gunakan fixture company terpisah ber-allowlist tanpa pengguna lokal dengan cache yang masih berlaku. Gunakan DNS privat pengujian dan blokir egress keluar sebagai lapisan containment kedua.

## Environment variable

| Variabel | Tujuan fixture |
|---|---|
| `OMNISIGHT_TEST_LOCAL_USERNAME`, `OMNISIGHT_TEST_LOCAL_PASSWORD` | Pengguna lokal aktif tanpa MFA dan dengan konteks bawaan |
| `OMNISIGHT_TEST_HRIS_COMPANY_ID`, `OMNISIGHT_TEST_HRIS_USERNAME`, `OMNISIGHT_TEST_HRIS_PASSWORD`, `OMNISIGHT_TEST_FIXTURE_CONTROLLER_URL` | Fixture sukses HRIS, penolakan eksplisit, circuit/outage, dan parser |
| `OMNISIGHT_TEST_HRIS_EXPIRED_USERNAME`, `OMNISIGHT_TEST_HRIS_EXPIRED_PASSWORD` | Akun HRIS yang timestamp sinkronisasinya dimundurkan melewati TTL company oleh controller |
| `OMNISIGHT_TEST_MFA_USERNAME`, `OMNISIGHT_TEST_MFA_PASSWORD` | Akun lokal yang MFA-nya mula-mula nonaktif; reset sebelum pengujian |
| `OMNISIGHT_TEST_SWITCH_USERNAME`, `OMNISIGHT_TEST_SWITCH_PASSWORD`, `OMNISIGHT_TEST_TARGET_COMPANY_ID`, `OMNISIGHT_TEST_TARGET_AREA_ID` | Pengguna yang diberi akses ke company dan area regional tujuan |
| `OMNISIGHT_TEST_KB_USERNAME`, `OMNISIGHT_TEST_KB_PASSWORD`, `OMNISIGHT_TEST_SOP_DOCUMENT_ID` | Pengguna update/view `KB01` dan dokumen uji kosong di database yang memakai RustFS |
| `OMNISIGHT_TEST_REPORT_USERNAME`, `OMNISIGHT_TEST_REPORT_PASSWORD`, opsional `OMNISIGHT_TEST_REPORT_TABLE` | Pengguna view/create `RP01` dan tabel laporan yang diizinkan (bawaan `osc_activity_log`) |
| Khusus keamanan: `OMNISIGHT_TEST_MFA_ENABLED_USERNAME`, `OMNISIGHT_TEST_MFA_ENABLED_PASSWORD`, `OMNISIGHT_TEST_TOTP_SECRET` | Principal MFA aktif dan seed TOTP dari provisioning fixture terlindungi |
| Khusus keamanan: `OMNISIGHT_TEST_MFA_BRUTE_USERNAME`, `OMNISIGHT_TEST_MFA_BRUTE_PASSWORD`, `OMNISIGHT_TEST_MFA_BRUTE_TOTP_SECRET` | Principal MFA terpisah untuk menghabiskan batas percobaan |
| `OMNISIGHT_TEST_PAM_NO_MFA_USERNAME`, `OMNISIGHT_TEST_PAM_NO_MFA_PASSWORD`, `OMNISIGHT_TEST_PAM_STALE_MFA_USERNAME`, `OMNISIGHT_TEST_PAM_STALE_MFA_PASSWORD`, `OMNISIGHT_TEST_PAM_STALE_MFA_TOTP_SECRET`, `OMNISIGHT_TEST_PAM_TARGET_ID` | Principal berizin OP01 dan target aktif; satu tanpa MFA, satu dengan MFA aktif dan seed TOTP |
| `OMNISIGHT_TEST_IDOR_USERNAME`, `OMNISIGHT_TEST_IDOR_PASSWORD`, `OMNISIGHT_TEST_OTHER_COMPANY_ID`, `OMNISIGHT_TEST_OTHER_AREA_ID`, `OMNISIGHT_TEST_OTHER_SOP_DOCUMENT_ID` | Pengguna tanpa grant ke tenant/area lain dan dokumen uji tenant lain |
| `OMNISIGHT_TEST_AREA_IDOR_USERNAME`, `OMNISIGHT_TEST_AREA_IDOR_PASSWORD`, `OMNISIGHT_TEST_SAME_COMPANY_OTHER_AREA_DOCUMENT_ID` | Pengguna dengan cakupan satu area dan dokumen SOP di area lain pada company sama |

Skenario yang belum memiliki konfigurasi dilaporkan sebagai pytest skip, bukan lulus. CI harus meninjau atau menggagalkan skip pada fixture yang wajib disediakan. `OMNISIGHT_TEST_TIMEOUT` dapat mengubah timeout klien bawaan 10 detik.

Untuk job CI yang tidak boleh menerima fixture integrasi yang hilang sebagai build hijau, atur `OMNISIGHT_TEST_REQUIRE_FIXTURES=1`; variabel wajib yang hilang akan menggagalkan pengujian terkait, bukan melewatinya.

## Cakupan dan bentuk API saat ini

Suite mengikuti handler `osc_rest` saat ini. Rute attachment SOP berbentuk singular `/sop/documents/{document_id}/attachment`; pembuatan PDF menerima `{ "table_name": "..." }`. Kontrak desain di `planning/01_core_specs.md` menjelaskan resource attachment plural dan payload PDF berbasis template. Perbedaan kontrak ini perlu diselaraskan sebelum skema OpenAPI distabilkan.
