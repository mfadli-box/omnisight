# Technical Documentation: Network Poller Agent (`network_poller_agent`)

- **Date**: 2026-11-13
- **Author**: ai-auto (Golang System & Security Engineer)
- **Target Project**: `osc_auto/network_poller_agent`
- **Upstream Rust API & Contract Reference**: `osc_docs/rest/api-w2.md` & `osc_docs/rest/contracts/w2.openapi.yaml` (Wave 2 / Hari 13 SESI 3.1–3.2)
- **Supported Platforms**: Linux (`systemd`, `amd64`/`arm64`) & Windows (`Windows Service`, `amd64`)
- **Clean Architecture Layers Touched**: `domain`, `usecase`, `infrastructure` (`rustapi`, `storage`, `platform`, `probes`, `snmp`), `delivery`

## 1. Overview & System Architecture

Agent polling uptime sintetik & metrik jaringan (pola Uptime Kuma + LibreNMS) berjalan sebagai daemon lintas-platform:

1. **Enrollment** (`--enroll <TOKEN>`) — identik pola `host_telemetry_agent`: token → `agent_id` + `hmac_secret` + `company_id`, state lokal `0600` (opsional AES-256-GCM).
2. **Siklus polling** (interval `NETWORK_POLLER_INTERVAL`, default 60s) dengan sumber tugas file `monitors.json` (hot-reload tiap siklus, `0600` karena memuat community SNMP):
   - **Probe sintetik** per monitor (`monitors[]`): `HTTP`/`HTTPS` (status + waktu), `KEYWORD` (body ≤ 64 KiB berisi keyword), `TCP` (`host:port`), `DNS` (resolve hostname), `ICMP` (binary `ping` argumen eksplisit — tanpa shell), `DNS`/`HTTPS` juga mengekstrak **masa berlaku SSL cert** ke pesan heartbeat (`SSL 341d (2027-09-19)`; sorotan `SSL AKAN BERAKHIR` < 30 hari).
   - **Heartbeat** → `POST /api/v1/agents/uptime/ingest` (`UP|DOWN`, `ping_ms`, `msg` ≤ 500, `recorded_at`) — server menandai transisi `important` + evaluasi rule `uptime.down`.
   - **SNMP polling** (`snmp_devices[]`, SNMPv2c GET murni stdlib/BER): counter `ifHCInOctets/ifHCOutOctets` (64-bit, fallback 32-bit `ifInOctets/ifOutOctets`) + `ifInErrors/ifOutErrors/ifInDiscards/ifOutDiscards` per `if_index` yang dipetakan ke `interface_id` (`device_interfaces` milik company). Rate Bps dihitung delta antar-siklus (counter-reset clamp 0).
   - **Batch metrics** → `POST /api/v1/agents/metrics/ingest` (`snmp_interfaces` ≤ 500).

```
delivery.Scheduler (ticker, graceful shutdown)
  → usecase.Poller
      → storage.MonitorSource (monitors.json hot-reload, validasi entri)
      → probes.Prober            (http/tcp/dns/icmp — icmp_linux.go / icmp_windows.go)
      → probes.CounterPoller     → infrastructure/snmp (BER v2c GET)
      → rustapi.Client (HMAC)    → osc_rest
```

## 2. Directory & Clean Architecture Layout (`osc_auto/network_poller_agent/`)

```text
osc_auto/network_poller_agent/
├── cmd/network_poller_agent/             # main.go + enroll.go + paths_linux/windows.go
├── internal/
│   ├── domain/                           # MonitorConfig/SnmpDevice/Heartbeat + port
│   ├── usecase/                          # Poller (probe + SNMP rate) + unit test
│   ├── infrastructure/
│   │   ├── rustapi/                      # klien HMAC hardened + enroll/heartbeat/metrics
│   │   ├── storage/                      # state kredensial + MonitorSource (monitors.json)
│   │   ├── platform/                     # runner *_linux/*_windows
│   │   ├── probes/                       # prober (HTTP/KEYWORD/TCP/DNS/ICMP) + snmp poller
│   │   └── snmp/                         # BER encoder/decoder + klien v2c GET (stdlib murni)
│   └── delivery/                         # scheduler periodik
├── configs/                              # env example + monitors.json.example
└── deploy/
    ├── linux/network_poller_agent.service
    └── windows/install-service.ps1
```

## 3. Upstream Rust API (`osc_rest`) Integration Contract

| Endpoint / WS (`osc_rest`) | Method / Proto | Auth Mechanism | Retry & Timeout Policy | Payload / Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `/api/v1/agents/enroll` | `POST` | Public (enrollment token) | Timeout `15s`, 3× backoff+jitter | Tukar token → `agent_id`, `hmac_secret` (sekali), `company_id` |
| `/api/v1/agents/uptime/ingest` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× backoff (transport/5xx/429) | `UptimeHeartbeatPayload` (`monitor_id` wajib milik company; transisi `important` + rule `uptime.down` di server) |
| `/api/v1/agents/metrics/ingest` | `POST` | `HMAC-SHA256` + `X-Correlation-ID` | Timeout `15s`, 3× backoff | `snmp_interfaces` ≤ 500 → `interface_metric_snapshots` |

Signature kanonis sama dengan kontrak W2: `"{ts}\n{METHOD}\n{path}\n{sha256_hex(body)}"` (±30 s, konstanta waktu di sisi server). SNMP BER diverifikasi round-trip + error-status di `snmp/ber_test.go`.

## 4. Cross-Platform Deployment & Service Configuration

- **Linux (`systemd`)**: binary `/usr/local/bin/network_poller_agent` (`DynamicUser=yes`, `StateDirectory` `0700`); file `/etc/network_poller_agent/monitors.json` + env `0600`; probe ICMP memakai binary `ping` (setuid capabilitas dikelola OS) sehingga unit tidak butuh `CAP_NET_RAW`. Hardening unit lengkap.
- **Windows (`Windows Service`)**: binary `C:\ProgramData\network_poller_agent\network_poller_agent.exe`, SCM `network_poller_agent` (`LocalService`, recovery restart 5s/30s/60s); `monitors.json` default `C:\ProgramData\network_poller_agent\monitors.json`; ping memakai `ping -n 1 -w <ms>`.
- **Environment Variables**: `RUST_API_BASE_URL`, `NETWORK_POLLER_INTERVAL` (10s..1h), `NETWORK_POLLER_PROBE_TIMEOUT` (1s..1m), `NETWORK_POLLER_SNMP_TIMEOUT` (500ms..30s), `NETWORK_POLLER_MONITORS_FILE`, `NETWORK_POLLER_STATE_PATH`, `NETWORK_POLLER_STATE_KEY_HEX`, `NETWORK_POLLER_LOG_LEVEL`. Bentuk `monitors.json` lihat `configs/monitors.json.example` (`monitor_id`/`interface_id` = uuid yang dibuat admin via UI/API osc_rest).

Perintah build & verifikasi (dari `osc_auto/network_poller_agent/`):

```bash
go vet ./... && GOOS=windows GOARCH=amd64 go vet ./...
go test -race ./...
GOOS=linux GOARCH=amd64 go build -o bin/network_poller_agent ./cmd/network_poller_agent
GOOS=windows GOARCH=amd64 go build -o bin/network_poller_agent.exe ./cmd/network_poller_agent
```

## 5. Security Controls & Threat Mitigation

- ✅ TLS 1.2+ untuk semua probe HTTPS & klien osc_rest (tanpa `InsecureSkipVerify`); anti-SSRF ringan: URL tanpa userinfo, scheme `http|https` saja (selaras validator osc_rest; range privat diperbolehkan sesuai tujuan produk).
- ✅ HMAC-SHA256 per-request + `X-Correlation-ID`; SNMP community hanya di memori & file `0600` — tidak pernah di-log.
- ✅ **Tanpa shell** (`exec.Command` argumen eksplisit); host ICMP/`metachar` tervalidasi regex (anti argument-injection); DNS target harus hostname legal (`[a-zA-Z0-9-.]`, ≤ 253).
- ✅ Bounded reads: body HTTP probe ≤ 64 KiB, respons osc_rest ≤ 2 MiB, payload UDP ≤ 64 KiB.
- ✅ Timeout berlapis per probe/per request; scheduler satu goroutine (tanpa probe paralel tanpa batas); idempoten siklus.
- ✅ Non-root Linux & `LocalService` Windows; unit systemd hardening penuh.
- ✅ Verifikasi: `go vet ./...` OK (linux+windows), `go test -race ./...` OK (probes/snmp/rustapi/storage/usecase), cross-compile `GOOS=linux` & `GOOS=windows` OK.
