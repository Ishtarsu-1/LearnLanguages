#!/usr/bin/env bash
# Usage : ./scripts/notify-discord.sh "message"
# N'échoue jamais : sans webhook ou si l'envoi rate, affiche juste un warning.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
# On lit uniquement DISCORD_WEBHOOK_URL dans .env (pas besoin d'exporter les autres secrets)
if [ -z "${DISCORD_WEBHOOK_URL:-}" ] && [ -f "$ROOT/.env" ]; then
  DISCORD_WEBHOOK_URL="$(grep -E '^DISCORD_WEBHOOK_URL=' "$ROOT/.env" | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r')"
fi

if [ -z "${DISCORD_WEBHOOK_URL:-}" ]; then
  echo "notify-discord: DISCORD_WEBHOOK_URL non défini, rien envoyé" >&2
  exit 0
fi

MSG="${1:-}"
[ -z "$MSG" ] && { echo "notify-discord: message vide" >&2; exit 0; }

# Discord limite à 2000 caractères
MSG="${MSG:0:1990}"

CODE="$(jq -n --arg c "$MSG" '{content: $c}' \
  | curl -sS --max-time 10 -o /dev/null -w "%{http_code}" \
      -H "Content-Type: application/json" -d @- "$DISCORD_WEBHOOK_URL" 2>/dev/null)"

if [[ "$CODE" =~ ^2 ]]; then
  echo "notify-discord: envoyé (HTTP $CODE)" >&2
else
  echo "notify-discord: échec de l'envoi (HTTP ${CODE:-aucune réponse})" >&2
fi
exit 0
