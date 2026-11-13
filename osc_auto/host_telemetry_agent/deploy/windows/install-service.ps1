# =============================================================================
# install-service.ps1 — registrasi Windows Service "host_telemetry_agent"
# (omnisight W2 / SESI 3.2).
#
# Pemakaian (PowerShell as Administrator):
#   .\install-service.ps1 Install    # pasang + start (default)
#   .\install-service.ps1 Uninstall  # stop + hapus
#   .\install-service.ps1 Status     # tampilkan status SCM
#
# Enroll sekali (token dari admin osc_rest) sebelum service dimulai:
#   & "$env:ProgramData\host_telemetry_agent\host_telemetry_agent.exe" `
#       --enroll <TOKEN> --asset-model <UUID> --status-label <UUID>
#
# Binary hasil build diletakkan di
# C:\ProgramData\host_telemetry_agent\host_telemetry_agent.exe:
#   GOOS=windows GOARCH=amd64 go build -o "$env:ProgramData\host_telemetry_agent\host_telemetry_agent.exe" ./cmd/host_telemetry_agent
# =============================================================================

#Requires -RunAsAdministrator

param(
    [Parameter(Position = 0)]
    [ValidateSet('Install', 'Uninstall', 'Status')]
    [string]$Action = 'Install',

    [string]$BinaryPath = "$env:ProgramData\host_telemetry_agent\host_telemetry_agent.exe"
)

$ErrorActionPreference = 'Stop'
$ServiceName = 'host_telemetry_agent'
$DisplayName = 'omnisight host_telemetry_agent'
$Description = 'omnisight telemetry agent - inventaris OS + metrik host & Docker container -> osc_rest (HMAC).'

function Test-ServiceExists {
    & sc.exe query $ServiceName *> $null
    return ($LASTEXITCODE -eq 0)
}

switch ($Action) {
    'Install' {
        if (-not (Test-Path $BinaryPath)) {
            throw "Binary tidak ditemukan: $BinaryPath — build dulu: GOOS=windows GOARCH=amd64 go build -o `"$BinaryPath`" ./cmd/host_telemetry_agent"
        }

        # Idempoten: bila sudah terpasang, hentikan & hapus dulu (reinstall).
        if (Test-ServiceExists) {
            Write-Host "Service '$ServiceName' sudah ada — reinstall (stop + delete)."
            & sc.exe stop $ServiceName | Out-Null
            Start-Sleep -Seconds 2
            & sc.exe delete $ServiceName | Out-Null
            Start-Sleep -Seconds 1
        }

        # Jalankan sebagai LocalService (privilege minimal, bukan LocalSystem),
        # start otomatis saat boot, pemulihan otomatis: restart 5s/30s/60s
        # dengan counter failure di-reset tiap 24 jam.
        & sc.exe create $ServiceName "binPath= `"$BinaryPath`"" "DisplayName= $DisplayName" 'start= auto' 'obj= NT AUTHORITY\LocalService'
        if ($LASTEXITCODE -ne 0) { throw "sc.exe create gagal (exit $LASTEXITCODE)." }

        & sc.exe description $ServiceName $Description

        & sc.exe failure $ServiceName 'reset= 86400' 'actions= restart/5000/restart/30000/restart/60000'
        if ($LASTEXITCODE -ne 0) { throw "sc.exe failure gagal (exit $LASTEXITCODE)." }

        # Konfigurasi environment per-service (opsional — buang komentar & isi).
        # CATATAN: pastikan ACL registry terbatas (bukan world-readable).
        # New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" `
        #     -Name Environment -PropertyType MultiString -Force `
        #     -Value @(
        #         'RUST_API_BASE_URL=https://osc-rest.internal:8443',
        #         'HOST_TELEMETRY_INTERVAL=60s',
        #         'HOST_TELEMETRY_DOCKER_HOST_ID=<UUID-DockerHost>',
        #         'HOST_TELEMETRY_STATE_KEY_HEX=<64-hex>'
        #     )

        & sc.exe start $ServiceName
        if ($LASTEXITCODE -ne 0) { throw "sc.exe start gagal (exit $LASTEXITCODE)." }

        Write-Host "Service '$ServiceName' terpasang dan dijalankan."
        & sc.exe query $ServiceName
    }
    'Uninstall' {
        if (Test-ServiceExists) {
            & sc.exe stop $ServiceName | Out-Null
            Start-Sleep -Seconds 2
            & sc.exe delete $ServiceName
            Write-Host "Service '$ServiceName' dihapus."
        }
        else {
            Write-Host "Service '$ServiceName' tidak ditemukan."
        }
    }
    'Status' {
        & sc.exe query $ServiceName
    }
}
