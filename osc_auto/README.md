# osc_auto — Agen OmniSight

Agen adalah biner Go yang ditanam di setiap VM/host target. Agen **hanya**
berbicara dengan `osc_rest` melalui grup `/rest/agent` dan **tidak pernah**
mengakses database (lihat [blueprint](../osc_docs/planning/blueprint.md) §2).

> **Status: scaffold.** Kerangka agen (server kesehatan lokal + heartbeat)
> sudah ada dan dapat di-build. Endpoint operasional per modul
> (POD/NET/OBS/VMS/SEC/PAM/WEB/DSO) menyusul pada tahap implementasi.

## Struktur

```
osc_auto/
├── go.mod                     # modul Go (tanpa dependensi eksternal)
├── Dockerfile.agent           # Dockerfile generik (build arg AGENT)
├── docker-compose.agent.yml   # compose untuk menjalankan agen
├── .env.example               # contoh konfigurasi
├── internal/agent/agent.go    # logika bersama (server + heartbeat)
├── agent_vm/main.go           # agen per-VM: pod, net, obs, vms, sec, pam, web
├── agent_ci/main.go           # runner CI/CD: dso
├── agent_mx/main.go           # mail-relay (scaffold): mail
└── agent_ws/main.go           # web-server/WAF (scaffold): web, waf
```

## Konfigurasi (environment)

| Variabel | Default | Keterangan |
|---|---|---|
| `OSC_AGENT_ID` | per-agen | Identitas unik agen |
| `OSC_AGENT_ROLE` | per-agen | Peran agen (`vm`/`ci`/`mx`/`ws`) |
| `OSC_AGENT_CAPABILITIES` | per-agen | Daftar kapabilitas dipisah koma (override) |
| `OSC_REST_URL` | `http://127.0.0.1:37772/rest/agent` | URL grup agent di backend |
| `OSC_AGENT_TOKEN` | (kosong) | Token bearer; samakan dengan `CR_KEYS` |
| `OSC_AGENT_LISTEN` | `0.0.0.0:37775` | Alamat HTTP agen |
| `OSC_AGENT_INTERVAL` | `30` | Interval heartbeat (detik) |

## Build & Jalankan

Build langsung:

```bash
# dari direktori osc_auto
go build ./...
go run ./agent_vm
```

Via Docker:

```bash
# satu agen
docker build -f Dockerfile.agent --build-arg AGENT=agent_vm -t omnisight/agent_vm .
docker run --rm -e OSC_AGENT_ID=agent-vm-01 -e OSC_AGENT_TOKEN=xxx omnisight/agent_vm

# semua agen (compose)
cp .env.example .env   # isi OSC_AGENT_TOKEN
docker compose -f docker-compose.agent.yml up -d --build
```

## Endpoint lokal agen

| Endpoint | Keterangan |
|---|---|
| `GET /health` | Status kesehatan (200) + uptime |
| `GET /info` | Identitas, peran, kapabilitas, versi |
