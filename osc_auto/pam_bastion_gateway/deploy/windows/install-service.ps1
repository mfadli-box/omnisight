# =============================================================================
# install-service.ps1 — registrasi Windows Service "pam_bastion_gateway"
# (omnisight W3 / SESI 4.2).
#
# Pemakaian (PowerShell as Administrator):
#   .\install-service.ps1 Install    # pasang + start (default)
#   .\install-service.ps1 Uninstall  # stop + hapus
#   .\install-service.ps1 Status     # tampilkan status SCM
#
# Enroll sekali (token dari admin osc_rest) sebelum service dimulai:
#   & "$env:ProgramData\pam_bastion_gateway\pam_bastion_gateway.exe" `
#       --enroll <TOKEN> --asset-model <UUID> --status-label <UUID>
#
# Binary hasil build diletakkan di
# C:\ProgramData\pam_bastion_gateway\pam_bastion_gateway.exe:
#   GOOS=windows GOARCH=amd64 go build -o "$env:ProgramData\pam_bastion_gateway\pam_bastion_gateway.exe" ./cmd/pam_bastion_gateway
# =============================================================================

#Requires -RunAsAdministrator

param(
    [Parameter(Position = 0)]
    [ValidateSet('Install', 'Uninstall', 'Status')]
    [string]$Action = 'Install',

    [string]$BinaryPath = "$env:ProgramData\pam_bastion_gateway\pam_bastion_gateway.exe"
)

$ErrorActionPreference = 'Stop'
$ServiceName = 'pam_bastion_gateway'
$DisplayName = 'omnisight pam_bastion_gateway'
$Description = 'omnisight PAM bastion - WebSocket-to-SSH proxy (ephemeral ticket, Command ACL, session recording -> RustFS).'

function Test-ServiceExists {
    & sc.exe query $ServiceName *> $null
    return ($LASTEXITCODE -eq 0)
}

switch ($Action) {
    'Install' {
        if (-not (Test-Path $BinaryPath)) {
            throw "Binary tidak ditemukan: $BinaryPath — build dulu: GOOS=windows GOARCH=amd64 go build -o `"$BinaryPath`" ./cmd/pam_bastion_gateway"
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
        if ($LASTEXITCODE -ne 0) { throw "sc.exe description gagal." }

        & sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/30000/restart/60000
        if ($LASTEXITCODE -ne 0) { throw "sc.exe failure gagal." }

        # Direktori data (state + known_hosts + rekaman lokal): ACL terbatas
        # pada LocalService & Administrators (anti akses pengguna biasa).
        $dataDir = "$env:ProgramData\pam_bastion_gateway"
        New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
        & icacls.exe $dataDir /inheritance:r /grant:r 'NT AUTHORITY\LocalService:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' | Out-Null

        & sc.exe start $ServiceName
        if ($LASTEXITCODE -ne 0) { throw "sc.exe start gagal." }
        Write-Host "Service '$ServiceName' terpasang & dimulai."
    }
    'Uninstall' {
        if (Test-ServiceExists) {
            & sc.exe stop $ServiceName | Out-Null
            Start-Sleep -Seconds 2
            & sc.exe delete $ServiceName
            Write-Host "Service '$ServiceName' dihapus."
        } else {
            Write-Host "Service '$ServiceName' tidak ditemukan."
        }
    }
    'Status' {
        & sc.exe query $ServiceName
    }
}
