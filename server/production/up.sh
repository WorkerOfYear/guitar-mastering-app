#!/usr/bin/env bash
# Puts this checkout into production — run from main after merging (CLAUDE.md):
#   bash server/production/up.sh
# Builds the API (dist-api/api.js) into $GUITAR_DIR/api, builds and (re)starts all production services, checks the API answers.
# Env: GUITAR_DIR (default /srv/guitar). Uses node from the server if it's there, else node:22 in docker.
set -euo pipefail
cd "$(dirname "$0")/../.."
export GUITAR_DIR="${GUITAR_DIR:-/srv/guitar}"

STEPS='[ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci
npm run build:api'
if command -v npm >/dev/null; then
  bash -ec "$STEPS"
else
  docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -ec "$STEPS"
fi

mkdir -p "$GUITAR_DIR/api" "$GUITAR_DIR/data" "$GUITAR_DIR/audio" "$GUITAR_DIR/score"
chown 1000:1000 "$GUITAR_DIR/score" 2>/dev/null || true
[ -f "$GUITAR_DIR/.env" ] || echo "ВНИМАНИЕ: нет $GUITAR_DIR/.env — без APP_PASSWORD войти не получится (README.md)" >&2
rm -rf "$GUITAR_DIR/api"/* && cp -r dist-api/. "$GUITAR_DIR/api/"
(cd server/production && docker compose up -d --build >/dev/null && docker restart guitar-api >/dev/null)

for _ in $(seq 20); do
  if [ "$(curl -fsS http://127.0.0.1:8791/api/health 2>/dev/null || true)" = "ok" ]; then
    echo "OK: production поднят с $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
echo "ОШИБКА: API не отвечает. Смотри: cd server/production && docker compose ps && docker compose logs --tail 50" >&2
exit 1
