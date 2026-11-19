#!/usr/bin/env bash
# Démarre les vraies voix de Mochi (Linux, macOS) : à relancer après chaque redémarrage du PC.
#   - Kokoro (anglais) : redémarre le conteneur Docker « kokoro » s'il est arrêté ;
#   - MeloTTS (coréen) : lance tools/melotts_server.py dans son environnement Python.
# Variables facultatives : MELOTTS_VENV (défaut ~/melotts), DEVICE (cuda, mps ou cpu : détecté sinon).
set -euo pipefail
cd "$(dirname "$0")/.."

if command -v docker >/dev/null 2>&1 && docker inspect kokoro >/dev/null 2>&1; then
  if [ "$(docker inspect -f '{{.State.Running}}' kokoro)" != "true" ]; then
    echo "▶ Kokoro : démarrage du conteneur"; docker start kokoro >/dev/null
  else echo "✓ Kokoro tourne déjà"; fi
else
  echo "ℹ️  Pas de conteneur « kokoro » (voir SETUP.md, Vraies voix)"
fi

# Piper (russe) : en arrière-plan s'il est installé (rapide sur processeur)
PIPER_VENV="${PIPER_VENV:-$HOME/piper}"
if [ -x "$PIPER_VENV/bin/python" ]; then
  if curl -s -m 1 http://127.0.0.1:8883/health >/dev/null 2>&1; then echo "✓ Piper (russe) tourne déjà"
  else echo "▶ Piper (russe) → http://127.0.0.1:8883/v1"; "$PIPER_VENV/bin/python" tools/piper_server.py >/tmp/mochi-piper.log 2>&1 & fi
else
  echo "ℹ️  Piper (voix russes) non installé : voir SETUP.md, Vraies voix"
fi

VENV="${MELOTTS_VENV:-$HOME/melotts}"
if [ ! -f "$VENV/bin/activate" ]; then
  echo "⚠️  Environnement MeloTTS introuvable dans $VENV (voir SETUP.md, Vraies voix)"; exit 1
fi
if [ -z "${DEVICE:-}" ]; then
  if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then DEVICE=cuda
  elif [ "$(uname -s)" = "Darwin" ] && [ "$(uname -m)" = "arm64" ]; then DEVICE=mps
  else DEVICE=cpu; fi
fi
export DEVICE
# shellcheck disable=SC1091
source "$VENV/bin/activate"
echo "▶ MeloTTS (DEVICE=$DEVICE) → http://127.0.0.1:8881/v1   (Ctrl+C pour arrêter)"
exec python tools/melotts_server.py
