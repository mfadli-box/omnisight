# Panduan Pengguna OmniSight

## Alur kerja SRE harian

1. Masuk melalui URL OmniSight yang disetujui perusahaan. Pilih **Local Account** untuk identitas lokal atau pilih company saat diminta. Masukkan nama pengguna dan kata sandi. Jika akun memakai MFA, masukkan kode enam digit dari aplikasi autentikator.
2. Pastikan company dan area regional pada header sudah benar. Gunakan pengalih company/area saat konteks kerja berubah. Navigasi akan dimuat ulang untuk konteks terpilih. Modul yang tidak terlihat berarti role tidak memiliki `can_view`; minta akses kepada administrator.
3. Buka **CT01 Control Tower** untuk memeriksa status store, kesehatan agent, dan ringkasan insiden. Selidiki heartbeat lama atau healthcheck gagal sesuai runbook; jangan gunakan PAM untuk mengakses sistem tanpa perubahan atau alasan insiden yang disetujui.
4. Periksa **OP02 Agent & Scheduler** untuk heartbeat node dan status job. Perlakukan node dengan heartbeat lama sebagai tidak terjangkau sampai backend mengonfirmasi heartbeat terakhir dan store terkait.
5. Gunakan **KB01 SOP** untuk membaca prosedur yang telah disetujui dan masih berlaku. Unggah hanya lampiran PDF, DOCX, atau teks UTF-8 yang didukung ke dokumen area Anda. Pastikan berkas tersimpan setelah unggah.
6. Catat perubahan operasional melalui proses insiden/perubahan yang berlaku. Log aktivitas OmniSight merupakan rekaman audit; jangan masukkan kata sandi, OTP, backup code, token API, atau secret pelanggan ke alasan maupun filter laporan.

## Mengaktifkan MFA

1. Masuk dengan kata sandi lalu buka pengaturan profil/keamanan.
2. Mulai setup MFA. Pindai QR/URI provisioning yang ditampilkan dengan aplikasi autentikator yang disetujui.
3. Masukkan kode enam digit yang masih berlaku untuk mengaktifkan MFA.
4. Simpan backup code sekali pakai pada vault password yang disetujui organisasi. Setiap kode hanya dapat digunakan satu kali. Jangan simpan dalam email, tiket, source control, screenshot, atau chat bersama.
5. Keluar lalu masuk kembali untuk memastikan kode autentikator menyelesaikan challenge.

Jika perangkat hilang, gunakan satu backup code saat login untuk menonaktifkan MFA dan memulihkan akses, lalu segera daftarkan autentikator baru. Kode pemulihan akan dikonsumsi dan sesi dicabut. Jika tidak ada backup code, gunakan proses reset email terverifikasi organisasi atau hubungi administrator melalui jalur yang disetujui. Administrator harus mengonfirmasi identitas, melakukan reset dengan alasan yang diaudit, dan meminta pengguna mendaftar ulang.

## PAM Bastion (OP01)

1. Pastikan target berada dalam cakupan company dan regional Anda serta terdapat tiket/perubahan yang telah disetujui.
2. Buka OP01, pilih target yang diizinkan, dan masukkan alasan bisnis singkat atau ID tiket tanpa secret.
3. PAM mewajibkan MFA aktif. Jika verifikasi MFA terakhir lebih dari 15 menit, selesaikan prompt OTP step-up.
4. Mulai hanya jenis dan durasi sesi yang disetujui runbook. Ikuti banner akses target dan kebijakan perekaman sesi. Tutup sesi setelah pekerjaan selesai dan perbarui tiket terkait.
5. Jika target tidak ditemukan, akses ditolak, atau OTP step-up gagal, hentikan proses dan minta role/konteks yang sesuai. Jangan mencoba identifier regional atau tenant lain.

API saat ini mengotorisasi dan mencatat permintaan sesi PAM. Broker terminal, injeksi kredensial, perekaman, dan penegakan protokol target adalah kapabilitas terpisah yang harus dikonfirmasi pada implementasi PAM deployment sebelum digunakan.

## Mengekspor laporan

### Ekspor Excel (RP01)

Pilih tabel yang diizinkan pada RP01 dan unduh berkas `.xlsx` yang dihasilkan. Ekspor memeriksa privilege, dibatasi allowlist dan tenant, serta diarsipkan secara privat. Simpan hanya pada lokasi yang disetujui, terapkan klasifikasi data sesuai isinya, dan hapus salinan lokal mengikuti kebijakan retensi. Jangan masukkan teks SQL atau identifier arbitrer ke request.

### Pembuatan PDF (RP02)

Pilih sumber/filter laporan yang tersedia pada UI terpasang dan buat PDF. Periksa konteks company/area sebelum mengunduh. Arsip laporan mengikuti izin tenant yang sama dengan catatan sumber; gunakan hanya template dan filter yang disetujui. Backend saat ini menerima field `table_name`, jadi ikuti UI yang dipasang di lingkungan Anda bila berbeda dari panduan ini.

## Keamanan MFA dan sesi

Keluar dari sesi pada workstation bersama dan kunci perangkat yang ditinggalkan. Token sesi OmniSight harus tetap berada dalam cookie terlindungi yang dikelola UI resmi. Jangan salin bearer token dari alat browser atau membagikan URL terautentikasi. Laporkan perangkat hilang, backup code yang terekspos, atau prompt login tak terduga kepada tim keamanan.
