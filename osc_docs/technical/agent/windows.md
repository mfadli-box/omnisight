# Agent di Windows

Agent Windows diutamakan untuk metrik host dan heartbeat. Untuk operasi container produksi, Linux tetap menjadi platform utama.

## 1. Dukungan

| Komponen | Dukungan |
|---|---|
| Windows Server 2019/2022 | Didukung untuk agent host |
| Windows 10/11 | Didukung untuk agent host, bukan server produksi |
| Container agent | Terbatas; Docker Desktop/WSL2 atau Podman machine |
| Edge agent | Tidak didukung di Windows |
| Network/backup agent | Tidak disarankan; gunakan host Linux di lokasi |

## 2. Prasyarat

- Hak administrator untuk instalasi.
- TLS 1.2+ aktif.
- Waktu tersinkron dengan domain/NTP.
- Port keluar 443 ke collector.
- Sertifikat collector/CA tersedia.
- Akun service dengan hak minimum.

## 3. Direktori dan ACL

```text
C:\Program Files\OmniSight\        # binary, read-only untuk service
C:\ProgramData\OmniSight\          # config, state, buffer
C:\ProgramData\OmniSight\secrets\  # certificate/key atau referensi store
C:\ProgramData\OmniSight\logs\     # log
```

ACL yang disarankan:

- `Administrators`: Full Control.
- Akun service: Read & Execute pada binary, Modify pada `ProgramData\OmniSight`, Read pada secrets.
- `Users`: tidak punya akses ke secrets.

Contoh PowerShell (placeholder, jalankan sebagai admin):

```powershell
$root = "C:\ProgramData\OmniSight"
New-Item -ItemType Directory -Path $root -Force | Out-Null
New-Item -ItemType Directory -Path "$root\secrets" -Force | Out-Null
New-Item -ItemType Directory -Path "$root\logs" -Force | Out-Null

icacls $root /inheritance:r
icacls $root /grant:r "Administrators:(OI)(CI)F"
icacls $root /grant:r "OMNISIGHT\svc-omnisight:(OI)(CI)M"
icacls "$root\secrets" /grant:r "OMNISIGHT\svc-omnisight:(OI)(CI)R"
```

Sesuaikan nama akun service. Jangan memberi hak `Everyone` atau `Users`.

## 4. Akun service

Pilihan, dari paling disarankan:

1. **gMSA** (Group Managed Service Account) jika host tergabung domain.
2. **Akun service khusus** dengan hak minimum dan “Log on as a service”.
3. **Virtual service account** bila kebijakan memungkinkan.

Hindari `LocalSystem` kecuali terpaksa; jika dipakai, batasi akses jaringan dan file.

Hak yang dibutuhkan:

- Membaca performance counters.
- Membaca event log tertentu.
- Menulis ke direktori data/log.
- Membuka koneksi keluar 443.

Tidak perlu:

- Administrator lokal penuh.
- Akses ke seluruh registry.
- WinRM/PowerShell bebas.
- Akses ke share administratif.

## 5. Instalasi service

Gunakan WinSW atau mekanisme service manager yang disetujui.

Contoh `OmniSightAgent.xml`:

```xml
<service>
  <id>OmniSightAgent</id>
  <name>OmniSight Host Agent</name>
  <description>Mengirim metrik host ke OmniSight.</description>
  <executable>C:\Program Files\OmniSight\omnisight-agent.exe</executable>
  <arguments>run --config C:\ProgramData\OmniSight\agent.yaml</arguments>
  <workingdirectory>C:\ProgramData\OmniSight</workingdirectory>
  <serviceaccount>
    <username>DOMAIN\svc-omnisight$</username>
    <allowservicelogon>true</allowservicelogon>
  </serviceaccount>
  <onfailure action="restart" delay="10 sec" />
  <onfailure action="restart" delay="30 sec" />
  <resetfailure>1 hour</resetfailure>
  <stoptimeout>15 sec</stoptimeout>
  <log mode="roll-by-size">
    <sizeThreshold>10240</sizeThreshold>
    <keepFiles>8</keepFiles>
  </log>
</service>
```

Catatan: gMSA memakai nama berakhiran `$`. Untuk akun lokal, isi username/password sesuai kebijakan dan simpan password dengan aman. Jangan menaruh password di file XML yang bisa dibaca semua orang.

Instalasi:

```powershell
Copy-Item .\omnisight-agent.exe "C:\Program Files\OmniSight\omnisight-agent.exe"
Copy-Item .\OmniSightAgent.xml "C:\Program Files\OmniSight\OmniSightAgent.xml"
& "C:\Program Files\OmniSight\OmniSightAgent.exe" install
& "C:\Program Files\OmniSight\OmniSightAgent.exe" start
Get-Service OmniSightAgent
```

## 6. Enrollment

1. Admin membuat token di portal.
2. Simpan token di file dengan ACL terbatas.
3. Jalankan enroll sebagai akun service atau admin:

```powershell
& "C:\Program Files\OmniSight\omnisight-agent.exe" enroll `
  --collector https://collector.internal.example `
  --kind host `
  --token-file C:\ProgramData\OmniSight\secrets\enrollment_token `
  --state-dir C:\ProgramData\OmniSight
```

4. Hapus file token setelah berhasil.
5. Pastikan sertifikat client tersimpan di certificate store atau file dengan ACL ketat.

## 7. Sertifikat dan TLS

- Pilihan A: simpan di Windows Certificate Store (`LocalMachine\My`), private key hanya untuk akun service.
- Pilihan B: file PEM dengan ACL hanya akun service.
- CA collector harus dipercaya.
- Rotasi sertifikat otomatis; alert jika gagal.
- Jangan menonaktifkan validasi TLS.

Periksa:

```powershell
Get-ChildItem Cert:\LocalMachine\My | Select-Object Subject, Thumbprint, NotAfter
```

## 8. Firewall

```powershell
New-NetFirewallRule -DisplayName "OmniSight Agent Outbound" `
  -Direction Outbound -Action Allow -Protocol TCP -RemotePort 443

New-NetFirewallRule -DisplayName "Block Inbound OmniSight Agent" `
  -Direction Inbound -Action Block -Program "C:\Program Files\OmniSight\omnisight-agent.exe"
```

- Tidak ada inbound rule untuk agent.
- Batasi outbound ke collector dan endpoint integrasi yang diizinkan.
- Jangan membuka RDP ke internet; gunakan bastion/VPN.

## 9. Metrik host Windows

Sumber data:

- Performance Counters: CPU, memori, disk, network, process count.
- WMI/CIM terbatas untuk informasi OS.
- Event Log terpilih untuk health.

Aturan:

- Jangan menjalankan PowerShell script bebas dari perintah collector.
- Jangan mengumpulkan command line proses, isi registry, atau data pengguna.
- Gunakan API native; batasi query WMI.
- Jika akun service tidak punya akses performance counter, berikan hak minimum melalui grup yang sesuai.

## 10. Container di Windows

Untuk `agent-container`:

- Docker Desktop dengan WSL2 atau Podman machine.
- Akses API melalui named pipe; jangan mengekspos ke jaringan.
- Compose dapat dipakai untuk agent, tetapi operasi container Linux lebih stabil di host Linux.
- Metrik host Windows tetap lebih baik memakai agent host native.
- Jangan menjalankan Docker Desktop pada server produksi tanpa kebijakan yang jelas.

## 11. Hardening Windows

- [ ] Windows Update aktif dan reboot terjadwal.
- [ ] Microsoft Defender aktif.
- [ ] Firewall default deny inbound.
- [ ] BitLocker untuk volume data.
- [ ] Secure Boot dan TPM bila tersedia.
- [ ] SMBv1 dimatikan.
- [ ] RDP hanya via bastion/VPN, MFA, dan pembatasan IP.
- [ ] WinRM/PowerShell remoting dibatasi.
- [ ] AppLocker/WDAC bila memungkinkan.
- [ ] LAPS untuk akun admin lokal.
- [ ] Audit policy dan event forwarding.
- [ ] Akun service minimum, tanpa admin.
- [ ] Wazuh agent opsional.
- [ ] Uninstall software tidak terpakai.

## 12. Update dan rollback

1. Verifikasi signature rilis.
2. Uji di host canary.
3. Hentikan service dengan aman.
4. Ganti binary, simpan versi lama.
5. Jalankan service.
6. Cek heartbeat dan metrik.
7. Jika gagal, kembalikan binary lama dan restart.

```powershell
& "C:\Program Files\OmniSight\OmniSightAgent.exe" stop
Copy-Item .\omnisight-agent.exe "C:\Program Files\OmniSight\omnisight-agent.exe" -Force
& "C:\Program Files\OmniSight\OmniSightAgent.exe" start
```

## 13. Troubleshooting

| Gejala | Periksa |
|---|---|
| Service tidak start | Event Viewer, path binary, akun service, ACL |
| Agent offline | Firewall outbound, DNS, proxy, jam sistem |
| Sertifikat ditolak | Thumbprint, CA, private key permission, waktu |
| Metrik kosong | Performance counter permission, counter name |
| Enroll gagal | Token, jenis agent, waktu, TLS |
| Buffer penuh | Koneksi collector, disk, rate limit |

Log:

```powershell
Get-Content C:\ProgramData\OmniSight\logs\agent.log -Tail 200
Get-EventLog -LogName Application -Newest 50
```

Jangan mengirim isi secret saat melapor.

## 14. Checklist

- [ ] Akun service minimum dan bukan LocalSystem.
- [ ] ACL direktori ketat.
- [ ] Sertifikat di store/file dengan private key terlindungi.
- [ ] Outbound-only.
- [ ] Tanpa PowerShell bebas.
- [ ] Waktu tersinkron.
- [ ] Defender dan firewall aktif.
- [ ] Update dan rollback diuji.
- [ ] Log rotation aktif.
- [ ] Agent dapat dicabut dari portal.
