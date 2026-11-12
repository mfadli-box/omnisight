# =============================================================================
# install-service.ps1 — registrasi Windows Service "agent_cs" (omnisight).
#
# Pemakaian (PowerShell as Administrator):
#   .\install-service.ps1 Install    # pasang + start (default)
#   .\install-service.ps1 Uninstall  # stop + hapus
#   .\install-service.ps1 Status     # tampilkan status SCM
#
# Binary hasil build diletakkan di C:\ProgramData\agent_cs\agent_cs.exe:
#   GOOS=windows GOARCH=amd64 go build -o "$env:ProgramData\agent_cs\agent_cs.exe" ./cmd/agent_cs
# =============================================================================

#Requires -RunAsAdministrator

param(
    [Parameter(Position = 0)]
    [ValidateSet('Install', 'Uninstall', 'Status')]
    [string]$Action = 'Install',

    [string]$BinaryPath = "$env:ProgramData\agent_cs\agent_cs.exe"
)

$ErrorActionPreference = 'Stop'
$ServiceName = 'agent_cs'
$DisplayName = 'omnisight agent_cs'
$Description = 'omnisight health probe agent - probe berkala GET /api/v1/health pada osc_rest.'

function Test-ServiceExists {
    & sc.exe query $ServiceName *> $null
    return ($LASTEXITCODE -eq 0)
}

switch ($Action) {
    'Install' {
        if (-not (Test-Path $BinaryPath)) {
            throw "Binary tidak ditemukan: $BinaryPath — build dulu: GOOS=windows GOARCH=amd64 go build -o `"$BinaryPath`" ./cmd/agent_cs"
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

        # Konfigurasi environment per-service (opsional — buang komentar & isi):
        # New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\$ServiceName" `
        #     -Name Environment -PropertyType MultiString -Force `
        #     -Value @(
        #         'RUST_API_BASE_URL=https://osc-rest.internal:8443',
        #         'RUST_API_TOKEN=<TOKEN-DARI-VAULT>',
        #         'AGENT_CS_INTERVAL=30s',
        #         'AGENT_CS_LOG_LEVEL=info'
        #     )
        # Catatan: pastikan ACL registry tersebut terbatas (bukan world-readable).

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
