#!/usr/bin/env bash
# Puts the API from this checkout into production — run from main after merging (CLAUDE.md):
#   bash server/api/up.sh
# Builds dist-api/api.js, copies it to $API_DIR/api, (re)starts the guitar-api container and checks it answers.
# Env: API_DIR (default /srv/guitar). Uses node from the server if it's there, else node:22 in docker.
set -euo pipefail
cd "$(dirname "$0")/../.."
export API_DIR="${API_DIR:-/srv/guitar}"

STEPS='[ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci
npm run build:api'
if command -v npm >/dev/null; then
  bash -ec "$STEPS"
else
  docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -ec "$STEPS"
fi

mkdir -p "$API_DIR/api" "$API_DIR/data"
[ -f "$API_DIR/.env" ] || echo "ВНИМАНИЕ: нет $API_DIR/.env — без APP_PASSWORD войти не получится (README.md)" >&2
rm -rf "$API_DIR/api"/* && cp -r dist-api/. "$API_DIR/api/"
(cd server/api && docker compose up -d >/dev/null && docker restart guitar-api >/dev/null)

for _ in $(seq 20); do
  if [ "$(curl -fsS http://127.0.0.1:8791/api/health 2>/dev/null || true)" = "ok" ]; then
    echo "OK: API поднят с $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 1
done
echo "ОШИБКА: API не отвечает. Смотри: cd server/api && docker compose logs --tail 50" >&2
exit 1
