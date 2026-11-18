# Démarre les vraies voix de Mochi (Windows, PowerShell) : à relancer après chaque redémarrage du PC.
#   - Kokoro (anglais) : redémarre le conteneur Docker « kokoro » s'il est arrêté ;
#   - MeloTTS (coréen) : lance tools\melotts_server.py dans son environnement Python.
# Si le script est refusé : Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
# Variables facultatives : $env:MELOTTS_VENV (défaut $HOME\melotts), $env:DEVICE (cuda ou cpu : détecté sinon).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

if (Get-Command docker -ErrorAction SilentlyContinue) {
  $running = docker inspect -f "{{.State.Running}}" kokoro 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "ℹ️  Pas de conteneur « kokoro » (voir SETUP.md, Vraies voix)" }
  elseif ($running -ne "true") { Write-Host "▶ Kokoro : démarrage du conteneur"; docker start kokoro | Out-Null }
  else { Write-Host "✓ Kokoro tourne déjà" }
} else { Write-Host "ℹ️  Docker introuvable : Kokoro n'est pas lancé" }

$venv = if ($env:MELOTTS_VENV) { $env:MELOTTS_VENV } else { Join-Path $HOME "melotts" }
$activate = Join-Path $venv "Scripts\Activate.ps1"
if (-not (Test-Path $activate)) { Write-Host "⚠️  Environnement MeloTTS introuvable dans $venv (voir SETUP.md, Vraies voix)"; exit 1 }
if (-not $env:DEVICE) {
  $env:DEVICE = "cpu"
  if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) { nvidia-smi *> $null; if ($LASTEXITCODE -eq 0) { $env:DEVICE = "cuda" } }
}
& $activate
Write-Host "▶ MeloTTS (DEVICE=$($env:DEVICE)) → http://127.0.0.1:8881/v1   (Ctrl+C pour arrêter)"
python tools\melotts_server.py
