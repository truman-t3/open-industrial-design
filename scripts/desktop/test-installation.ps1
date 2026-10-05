# SPDX-License-Identifier: MPL-2.0
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true') { throw 'This destructive installer lifecycle fixture runs only on an ephemeral CI runner.' }
$desktopRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../apps/desktop'))
$fixtureRoot = Join-Path $env:RUNNER_TEMP 'oid-installation-fixture'
if (Test-Path -LiteralPath $fixtureRoot) { throw 'Fixture path already exists; refusing to reuse it.' }
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$destination = Join-Path $fixtureRoot 'Application With Spaces'
$setup = @(Get-ChildItem -LiteralPath (Join-Path $desktopRoot 'windows-package') -Filter '*standard-setup.exe')
if ($setup.Count -ne 1) { throw 'Expected exactly one standard installer.' }
$expected = [IO.File]::ReadAllText((Join-Path $desktopRoot 'native-review/installed-app.sha256')).Trim()
if ($expected -notmatch '^[a-f0-9]{64}$') { throw 'Missing actual NSIS payload digest.' }
$profile = Join-Path $env:LOCALAPPDATA 'com.openindustrialdesign.desktop/workspace'
if (Test-Path -LiteralPath $profile) { throw 'Unexpected pre-existing app profile on clean runner.' }
New-Item -ItemType Directory -Path $profile -Force | Out-Null
# Synthetic bytes only. Never a real API key or customer project.
$sentinel = Join-Path $profile 'synthetic-project-sentinel.txt'
[IO.File]::WriteAllText($sentinel, 'installation-fixture-preserve-me')
for ($iteration = 1; $iteration -le 2; $iteration++) {
  $process = Start-Process -FilePath $setup[0].FullName -ArgumentList "/S /D=$destination" -PassThru -Wait -WindowStyle Hidden
  if ($process.ExitCode -ne 0) { throw "Install iteration $iteration failed: $($process.ExitCode)" }
  $installed = Join-Path $destination 'open-industrial-design-desktop.exe'
  if ((Get-FileHash -LiteralPath $installed -Algorithm SHA256).Hash -ne $expected) { throw 'Installed executable differs from built executable.' }
  foreach ($notice in @('NATIVE-NOTICES.txt', 'LICENSE.txt', 'Cargo.lock')) {
    if (!(Test-Path -LiteralPath (Join-Path $destination $notice))) { throw "Missing installed notice: $notice" }
  }
  if ([IO.File]::ReadAllText((Join-Path $destination '.oid-install')) -ne "Open Industrial Design installation v1`n") { throw 'Installer ownership marker differs.' }
  if ([IO.File]::ReadAllText($sentinel) -ne 'installation-fixture-preserve-me') { throw 'Synthetic project changed during installation.' }
}
$uninstallers = @(Get-ChildItem -LiteralPath $destination -Filter '*uninstall*.exe')
if ($uninstallers.Count -ne 1) { throw 'Expected one installed uninstaller.' }
$process = Start-Process -FilePath $uninstallers[0].FullName -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
if ($process.ExitCode -ne 0) { throw "Uninstall failed: $($process.ExitCode)" }
$deadline = [DateTime]::UtcNow.AddSeconds(30)
while ((Test-Path -LiteralPath $installed) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 250 }
if (Test-Path -LiteralPath $installed) { throw 'Application binary remains after uninstall.' }
if ([IO.File]::ReadAllText($sentinel) -ne 'installation-fixture-preserve-me') { throw 'Synthetic project changed during uninstall.' }
Write-Output 'PASS: silent install, same-version reinstall, installed hash/notices, uninstall and synthetic project preservation. Not blueprint UI or cross-version migration acceptance.'
