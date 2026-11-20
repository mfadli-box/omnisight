[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$BinaryPath,
  [Parameter(Mandatory=$true)][string]$ConfigPath
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this installer from an elevated PowerShell session.'
}
$sourceBinary = (Resolve-Path -LiteralPath $BinaryPath).Path
$sourceConfig = (Resolve-Path -LiteralPath $ConfigPath).Path
$programDir = Join-Path $env:ProgramFiles 'OmniSight'
$configDir = Join-Path $env:ProgramData 'OmniSight'
$installedBinary = Join-Path $programDir 'omnisight-agent.exe'
$extension = [IO.Path]::GetExtension($sourceConfig).ToLowerInvariant()
if ($extension -notin '.yaml','.yml','.json') { throw 'Use a YAML or legacy JSON configuration file.' }
$configName = if ($extension -eq '.json') { 'config.json' } else { 'agent.yaml' }
$installedConfig = Join-Path $configDir $configName
New-Item -ItemType Directory -Force -Path $programDir,$configDir | Out-Null
$service = Get-Service -Name 'OmniSightAgent' -ErrorAction SilentlyContinue
if ($null -ne $service -and $service.Status -ne 'Stopped') {
  Stop-Service -Name 'OmniSightAgent'
}
Copy-Item -LiteralPath $sourceBinary -Destination $installedBinary -Force
& icacls.exe $configDir /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' 'NT AUTHORITY\LOCAL SERVICE:(OI)(CI)R' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure the agent configuration ACL.' }
Copy-Item -LiteralPath $sourceConfig -Destination $installedConfig -Force
if ($extension -eq '.json') {
  $stateDir = Join-Path $configDir 'State'
  New-Item -ItemType Directory -Force -Path $stateDir | Out-Null
  & icacls.exe $stateDir /inheritance:r /grant:r 'SYSTEM:(OI)(CI)F' 'BUILTIN\Administrators:(OI)(CI)F' 'NT AUTHORITY\LOCAL SERVICE:(OI)(CI)M' | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not secure the agent state ACL.' }
  $config = Get-Content -LiteralPath $installedConfig -Raw | ConvertFrom-Json
  $config.state_dir = $stateDir
  $configJson = $config | ConvertTo-Json -Depth 5
  [IO.File]::WriteAllText($installedConfig,$configJson,[Text.UTF8Encoding]::new($false))
}
$serviceArgs = '"{0}" --config "{1}"' -f $installedBinary,$installedConfig
if ($null -eq $service) {
  New-Service -Name 'OmniSightAgent' -DisplayName 'OmniSight Agent' -Description 'OmniSight telemetry and signed healthcheck agent' -BinaryPathName $serviceArgs -StartupType Automatic | Out-Null
} else {
  sc.exe config OmniSightAgent binPath= $serviceArgs start= auto | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not update OmniSightAgent service configuration.' }
}
sc.exe config OmniSightAgent obj= 'NT AUTHORITY\LocalService' password= '' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not set the least-privilege service identity.' }
sc.exe failure OmniSightAgent reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not configure service recovery actions.' }
Start-Service -Name 'OmniSightAgent'
Write-Output 'OmniSightAgent installed and started.'
