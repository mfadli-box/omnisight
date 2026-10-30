# Compose Satuan Agent

Setiap agent memiliki file compose sendiri agar dapat dipasang, diperbarui, dan dicabut secara terpisah. Jangan menggabungkan semua agent dalam satu stack produksi.

## 1. Daftar file

| File | Agent | Platform | Catatan |
|---|---|---|---|
| `agent-host.compose.yaml` | Host metrics | Linux | `pid: host`, `/proc`/`/sys` read-only |
| `agent-container.compose.yaml` | Container ops | Linux | Socket proxy; `POST=0` untuk monitoring saja |
| `agent-network.compose.yaml` | RouterOS/SNMP | Linux | Butuh config dan kredensial vault |
| `agent-backup.compose.yaml` | Backup konfigurasi | Linux | Butuh akses baca perangkat + storage |

Untuk Windows, gunakan service native sesuai [windows.md](../windows.md). Untuk edge, gunakan service native sesuai [ubuntu.md](../ubuntu.md).

## 2. Prasyarat

- Docker Engine + Compose plugin atau Podman + Podman Compose.
- File CA collector dan sertifikat agent.
- Enrollment selesai.
- DNS/route ke collector.
- Port keluar 443.
- Folder secrets dengan permission ketat.

## 3. Struktur folder

```text
/opt/omnisight/compose/
├── .env
├── agent-host.compose.yaml
├── agent-container.compose.yaml
├── agent-network.compose.yaml
├── agent-backup.compose.yaml
├── config/
│   ├── agent-network.yaml
│   └── agent-backup.yaml
└── secrets/
    ├── collector_ca.pem
    ├── agent_cert.pem
    ├── agent_key.pem
    └── vault_token
```

Permission:

```bash
sudo chown -R root:omnisight /opt/omnisight/compose
sudo chmod 750 /opt/omnisight/compose /opt/omnisight/compose/secrets
sudo chmod 640 /opt/omnisight/compose/secrets/*
```

Jangan commit `.env` atau folder `secrets/`.

## 4. Variabel lingkungan

Salin `.env.example` menjadi `.env` dan isi placeholder:

```text
OSC_COLLECTOR_URL=https://collector.internal.example
OSC_AGENT_ID=placeholder-agent-id
OSC_AGENT_IMAGE=ghcr.io/omnisight/agent-host:1.0.0
OSC_AGENT_IMAGE_DIGEST=sha256:placeholder
OSC_ENGINE_SOCKET=/var/run/docker.sock
OSC_SOCKET_PROXY_POST=0
```

Aturan:

- Nama image harus dipin ke versi/digest; jangan `latest`.
- Jangan menaruh password, token, atau private key di `.env`.
- `.env` hanya untuk konfigurasi non-rahasia.

## 5. Menjalankan

```bash
# Validasi tanpa menjalankan
docker compose -f agent-host.compose.yaml --env-file .env config

# Jalankan
docker compose -f agent-host.compose.yaml --env-file .env up -d

# Lihat status dan log
docker compose -f agent-host.compose.yaml ps
docker compose -f agent-host.compose.yaml logs --tail=200
```

Podman:

```bash
podman compose -f agent-host.compose.yaml --env-file .env config
podman compose -f agent-host.compose.yaml --env-file .env up -d
```

Hentikan:

```bash
docker compose -f agent-host.compose.yaml down
```

## 6. Keamanan yang sudah diterapkan

- `read_only: true`
- `cap_drop: [ALL]`
- `no-new-privileges:true`
- `user: 65532:65532` untuk agent
- `tmpfs` kecil dengan `noexec,nosuid`
- `pids_limit`, `mem_limit`, `cpus`
- Tanpa `ports:`
- Log rotation
- Healthcheck
- Secrets via file

Yang **tidak** dilakukan secara default:

- Tidak ada `privileged: true`.
- Tidak ada `network_mode: host`.
- Tidak ada mount Docker socket ke agent; hanya ke socket proxy.
- Tidak ada shell interaktif.

## 7. Catatan per agent

### Host

- `pid: host` diperlukan untuk membaca proses host.
- `/proc` dan `/sys` dipasang read-only.
- Agent berjalan non-root; sebagian metrik proses mungkin terbatas.
- Untuk metrik paling lengkap dan aman, service native lebih disarankan.

### Container

- Socket proxy membatasi endpoint.
- `OSC_SOCKET_PROXY_POST=0` untuk monitoring read-only.
- `OSC_SOCKET_PROXY_POST=1` hanya jika deploy/rollback dibutuhkan; tetap memerlukan approval di platform.
- `EXEC`, `BUILD`, `SECRETS`, `CONFIGS`, `SWARM`, dan `SYSTEM` dimatikan.
- Docker group setara root; gunakan host khusus, rootless Podman, atau socket proxy ketat.

### Network

- Agent membutuhkan config allowlist perangkat.
- Kredensial perangkat diambil dari vault dengan token berumur pendek.
- Jangan menaruh password perangkat di compose.
- Agent hanya boleh menjangkau subnet perangkat yang ditentukan.

### Backup

- Agent membutuhkan akses baca perangkat dan akses tulis ke storage/collector.
- Snapshot dikirim terenkripsi.
- Restore tidak dilakukan oleh agent ini; restore melalui alur approval platform.

## 8. Podman

- Compose standar dapat dipakai dengan `podman compose`.
- Untuk socket Podman, sesuaikan `OSC_ENGINE_SOCKET`, misalnya socket rootless milik user agent.
- Beberapa fitur `deploy.resources` tidak dipakai; file memakai `mem_limit`/`cpus` agar lebih portabel.
- Untuk produksi rootless, jalankan compose sebagai user khusus dan aktifkan lingering bila perlu.
- Alternatif systemd: `podman generate systemd` atau Quadlet.

## 9. Update dan rollback

1. Ubah tag image ke versi baru.
2. Verifikasi digest.
3. `pull` dan `up -d` pada satu agent canary.
4. Cek healthcheck dan heartbeat.
5. Jika gagal, kembalikan tag/digest sebelumnya.
6. Catat perubahan.

## 10. Troubleshooting

| Gejala | Periksa |
|---|---|
| Container restart | `logs`, permission secret, config, resource limit |
| Healthcheck gagal | Binary health, state dir writable, cert |
| Collector tidak terjangkau | DNS, 443, proxy, firewall |
| Socket proxy 403 | Endpoint tidak diizinkan, `POST=0` |
| Permission `/proc` | `pid: host`, UID agent, read-only mount |
| Secret tidak terbaca | Permission file, nama secret, compose secrets |

## 11. Checklist

- [ ] Compose divalidasi dengan `config`.
- [ ] Tidak ada `ports`.
- [ ] Image dipin digest.
- [ ] Secret file 0400/0640.
- [ ] `read_only`, cap drop, no-new-privileges.
- [ ] Resource limit.
- [ ] Healthcheck.
- [ ] Log rotation.
- [ ] Satu project per agent.
- [ ] Agent dapat dicabut dari portal.
