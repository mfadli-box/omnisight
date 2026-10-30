# Agent di Ubuntu

Panduan ini memakai Ubuntu Server LTS. Semua contoh memakai placeholder dan tidak memuat rahasia nyata.

## 1. Prasyarat

- Ubuntu Server LTS terbaru yang masih didukung.
- Akses sudo melalui akun admin.
- Waktu tersinkron (NTP/chrony).
- DNS internal untuk collector.
- Port keluar 443 ke collector.
- Docker Engine atau Podman terpasang.
- Sertifikat collector dan CA sudah disiapkan oleh admin platform.

## 2. Akun dan direktori

```bash
sudo useradd --system --home-dir /var/lib/omnisight \
  --shell /usr/sbin/nologin omnisight

sudo install -d -m 0750 -o root -g omnisight /etc/omnisight
sudo install -d -m 0750 -o root -g omnisight /etc/omnisight/secrets
sudo install -d -m 0750 -o omnisight -g omnisight /var/lib/omnisight
sudo install -d -m 0750 -o omnisight -g omnisight /var/log/omnisight
```

Aturan:

- File secret: `0640 root:omnisight` atau `0400 omnisight:omnisight`.
- Jangan menaruh secret di `/tmp`, argumen command line, atau repository.
- Jangan memberi akses grup `docker` ke sembarang pengguna.

## 3. Docker atau Podman

### Opsi A: Podman rootless (disarankan untuk agent container)

```bash
sudo apt update
sudo apt install -y podman podman-compose
```

Aktifkan socket rootless untuk user agent bila diperlukan, lalu gunakan path socket yang sesuai. Podman rootless mengurangi dampak jika agent disusupi.

### Opsi B: Docker Engine

- Pasang dari repositori resmi.
- Jangan menambahkan user biasa ke grup `docker` tanpa alasan.
- Jika memakai socket proxy, tetap batasi endpoint.
- Untuk produksi, pertimbangkan Docker rootless atau host khusus agent.

Verifikasi:

```bash
docker compose version
podman --version
podman compose version
```

## 4. Enrollment agent

1. Admin membuat enrollment token di portal (sekali pakai, berlaku singkat).
2. Simpan token di file secret sementara, bukan di shell history.
3. Jalankan agent dengan mode enroll.
4. Agent membuat keypair dan CSR, lalu menerima sertifikat.
5. Hapus token setelah enrollment berhasil.

Contoh alur (placeholder):

```bash
sudo install -m 0400 -o omnisight -g omnisight \
  /dev/stdin /etc/omnisight/secrets/enrollment_token <<'EOF'
GANTI_DENGAN_TOKEN_SEKALI_PAKAI
EOF

sudo -u omnisight /usr/local/bin/omnisight-agent enroll \
  --collector https://collector.internal.example \
  --kind host \
  --token-file /etc/omnisight/secrets/enrollment_token \
  --state-dir /var/lib/omnisight

sudo rm -f /etc/omnisight/secrets/enrollment_token
```

Setelah enrollment, agent memakai mTLS dan tidak membutuhkan token lagi.

## 5. Menjalankan dengan compose satuan

Lihat folder [compose](compose/README.md). Ringkas:

```bash
sudo install -d -m 0750 -o root -g omnisight /opt/omnisight/compose
cd /opt/omnisight/compose

# Salin file compose dan .env.example, lalu isi nilai non-rahasia.
sudo cp agent-host.compose.yaml .
sudo cp .env.example .env

# Secret disimpan terpisah, tidak di .env.
sudo docker compose -f agent-host.compose.yaml --env-file .env config
sudo docker compose -f agent-host.compose.yaml --env-file .env up -d
```

Podman:

```bash
podman compose -f agent-host.compose.yaml --env-file .env config
podman compose -f agent-host.compose.yaml --env-file .env up -d
```

Jangan menambahkan `ports:` pada agent. Semua koneksi keluar.

## 6. Service native (disarankan untuk host dan edge)

### 6.1 Agent host

`/etc/systemd/system/omnisight-agent.service`:

```ini
[Unit]
Description=OmniSight Host Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=omnisight
Group=omnisight
ExecStart=/usr/local/bin/omnisight-agent run --config /etc/omnisight/agent.yaml
Restart=on-failure
RestartSec=5s
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadOnlyPaths=/proc /sys
ReadWritePaths=/var/lib/omnisight /var/log/omnisight
CapabilityBoundingSet=
AmbientCapabilities=
MemoryMax=256M
TasksMax=100
TimeoutStopSec=15s

[Install]
WantedBy=multi-user.target
```

Catatan: untuk metrik host yang lebih lengkap, agent membaca `/proc` dan `/sys` read-only. Jangan memberi `CAP_SYS_ADMIN`, akses Docker socket, atau `ptrace`.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now omnisight-agent
sudo systemctl status omnisight-agent
```

### 6.2 Agent edge

Agent edge membutuhkan:

- Baca/tulis direktori konfigurasi Nginx yang dikelola.
- Menjalankan `nginx -t` dan reload melalui helper terbatas.
- Rollback config.

Jangan memberi sudo penuh. Gunakan helper dengan perintah tetap:

```text
/usr/local/sbin/omnisight-nginx-check
/usr/local/sbin/omnisight-nginx-reload
```

Helper hanya menerima path config yang diizinkan dan tidak menerima argumen bebas dari jaringan.

## 7. Firewall

Contoh UFW:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 10.0.0.0/8 to any port 22 proto tcp
sudo ufw allow out 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Sesuaikan subnet manajemen. Jangan membuka port agent, Docker API, atau RouterOS API ke internet.

## 8. Hardening host

- [ ] Update keamanan otomatis (`unattended-upgrades`) dan reboot terjadwal.
- [ ] SSH hanya key, `PermitRootLogin no`, `PasswordAuthentication no`.
- [ ] Akses SSH hanya dari bastion/VPN.
- [ ] fail2ban untuk SSH.
- [ ] auditd aktif.
- [ ] AppArmor aktif; profil untuk agent bila tersedia.
- [ ] Chrony/NTP aktif.
- [ ] Partisi terpisah untuk `/var` dan log.
- [ ] Disk encryption untuk data sensitif.
- [ ] Matikan layanan tidak terpakai.
- [ ] Logrotate untuk log agent.
- [ ] Wazuh agent opsional untuk keamanan host.
- [ ] Monitoring disk, inode, dan waktu.
- [ ] Tanpa desktop environment di server.

## 9. Secret

- Sertifikat client dan key disimpan di `/etc/omnisight/secrets`.
- CA collector disimpan terpisah.
- Kredensial vault memakai token berumur pendek.
- Kredensial perangkat tidak disimpan di agent jika bisa diambil dari vault saat eksekusi.
- Rotasi sertifikat otomatis; alert jika gagal.
- Jangan mencetak secret ke log atau `docker inspect`.

## 10. Update dan rollback

1. Baca changelog dan verifikasi signature rilis.
2. Uji di satu agent canary.
3. Update image/versi dengan digest baru.
4. Cek health dan heartbeat.
5. Jika gagal, rollback ke digest sebelumnya.
6. Catat perubahan di audit platform.

Compose:

```bash
sudo docker compose -f agent-host.compose.yaml pull
sudo docker compose -f agent-host.compose.yaml up -d
sudo docker compose -f agent-host.compose.yaml ps
```

Jangan memakai tag `latest`.

## 11. Troubleshooting

| Gejala | Periksa |
|---|---|
| Agent offline | DNS, port 443 keluar, sertifikat, jam sistem |
| Sertifikat ditolak | Waktu skew, CA, sertifikat dicabut |
| Metrik host kosong | Mount `/proc`/`/sys`, permission, `pid: host` |
| Container API 403/401 | Token socket proxy, endpoint allowlist |
| Buffer penuh | Koneksi collector, rate limit, disk |
| Enroll gagal | Token kedaluwarsa/sudah dipakai, jenis agent salah |
| Agent restart berulang | Log, config, secret permission, resource limit |

Perintah diagnostik:

```bash
sudo journalctl -u omnisight-agent -n 200 --no-pager
sudo docker compose -f agent-host.compose.yaml logs --tail=200
curl -v https://collector.internal.example/healthz
timedatectl
```

Jangan mengirim isi secret saat melapor.

## 12. Checklist

- [ ] User service khusus, bukan root.
- [ ] Secret file permission benar.
- [ ] Outbound-only dan tidak ada `ports`.
- [ ] mTLS dan signature aktif.
- [ ] Resource limit dan log rotation.
- [ ] Update terjadwal dan rollback diuji.
- [ ] Firewall default deny.
- [ ] SSH hanya via bastion.
- [ ] Waktu tersinkron.
- [ ] Agent dapat dicabut dari portal.
