<#
Compile le firmware dans WSL, puis l'envoie a la carte par le Wi-Fi (OTA).

    powershell -ExecutionPolicy Bypass -File .\ota.ps1
    powershell -ExecutionPolicy Bypass -File .\ota.ps1 -Address 192.168.1.131

Sans -Address, l'adresse est celle que la carte a annoncee au serveur avec
son dernier battement.

La carte rappelle le poste qui envoie, en TCP : l'envoi part donc de
Windows, car depuis WSL2 en reseau NAT elle ne le joindrait pas. Au premier
envoi, le pare-feu Windows peut demander d'autoriser Python.
#>
param(
    [string]$Address,
    [string]$Server = 'https://pepperbox.ulysseguillot.fr',
    [string]$Distro = 'Ubuntu',
    # Venv qui sert deja a flasher en USB ; espota n'a besoin que de Python.
    [string]$Python = "$env:USERPROFILE\.esptool-venv\Scripts\python.exe"
)
$ErrorActionPreference = 'Stop'

$firmware = $PSScriptRoot
$linuxDir = (wsl -d $Distro -e wslpath -u ($firmware -replace '\\', '/')).Trim()

Write-Host "Compilation dans WSL ($linuxDir)"
wsl -d $Distro --cd $linuxDir -e bash -lc 'PLATFORMIO_SETTING_ENABLE_TELEMETRY=no ~/.platformio/penv/bin/pio run -e esp32s3'
if ($LASTEXITCODE -ne 0) { throw 'La compilation a echoue.' }

$secrets = Get-Content -Raw (Join-Path $firmware 'include\secrets.h')
if ($secrets -notmatch '#define\s+OTA_PASSWORD\s+"([^"]+)"') {
    throw 'OTA_PASSWORD introuvable dans include\secrets.h.'
}
$password = $Matches[1]

if (-not $Address) {
    try {
        $box = Invoke-RestMethod "$Server/api/box" -TimeoutSec 10
        if ($box.online -and $box.ip) { $Address = $box.ip }
    } catch {
        Write-Warning "Serveur injoignable : $($_.Exception.Message)"
    }
    if (-not $Address) { $Address = 'pepperbox-box.local' }
}

$linuxHome = (wsl -d $Distro -e bash -lc 'echo $HOME').Trim()
$espota = "\\wsl.localhost\$Distro" + ($linuxHome -replace '/', '\') +
    '\.platformio\packages\framework-arduinoespressif32\tools\espota.py'
if (-not (Test-Path $Python)) { $Python = 'python' }
$binary = Join-Path $firmware '.pio\build\esp32s3\firmware.bin'

Write-Host "Envoi a $Address"
& $Python $espota -i $Address -p 3232 -a $password -f $binary -r
if ($LASTEXITCODE -ne 0) {
    throw "Envoi refuse ou interrompu. La carte garde son firmware actuel."
}
Write-Host 'Envoye : la carte redemarre sur le nouveau firmware.'
