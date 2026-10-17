#!/usr/bin/env bash
# Puts the code from this checkout on the test stand. Run on the server after every change:
#   bash server/dev-stand/up.sh
# Checks the code (tsc, tests), builds the app and the API (server/api), swaps them into /srv/guitar-dev, restarts the API
# container and makes sure the stand now serves this build. Uses node from the server if it's there, else node:22 in docker.
# Env: STAND_DIR (default /srv/guitar-dev), SKIP_CHECKS=1 to skip tsc and tests.
set -euo pipefail
cd "$(dirname "$0")/../.."
export STAND_DIR="${STAND_DIR:-/srv/guitar-dev}"

STEPS='[ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ] || npm ci
'
[ -n "${SKIP_CHECKS:-}" ] || STEPS+='npx tsc --noEmit && npm test
'
STEPS+='npm run build && npm run build:api'
if command -v npm >/dev/null; then
  bash -ec "$STEPS"
else
  docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -ec "$STEPS"
fi

# Which code the stand serves: <stand>/version.txt — the commit, "+changes" if the checkout has uncommitted edits.
VERSION="$(git rev-parse --short HEAD)$([ -z "$(git status --porcelain)" ] || echo "+changes") $(date -u +%FT%TZ)"
echo "$VERSION" > dist/version.txt

# The app: copy next to the live one, then swap, so the stand never serves a half-copied build.
mkdir -p "$STAND_DIR" "$STAND_DIR/api" "$STAND_DIR/data"
cp server/dev-stand/Caddyfile "$STAND_DIR/Caddyfile"
rm -rf "$STAND_DIR/dist.new" && cp -r dist "$STAND_DIR/dist.new"
rm -rf "$STAND_DIR/dist.old" && { [ ! -d "$STAND_DIR/dist" ] || mv "$STAND_DIR/dist" "$STAND_DIR/dist.old"; }
mv "$STAND_DIR/dist.new" "$STAND_DIR/dist"
# The API, then restart its container (and Caddy, for a changed Caddyfile); `up -d` also starts the stand if it isn't running.
rm -rf "$STAND_DIR/api"/* && cp -r dist-api/. "$STAND_DIR/api/"
(cd server/dev-stand && docker compose up -d >/dev/null && docker restart guitar-dev-api dev-stand-web-1 >/dev/null)

# The stand must serve this build, and its API must answer.
for _ in $(seq 20); do
  served=$(curl -fsS http://127.0.0.1:8788/version.txt 2>/dev/null || true)
  api=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8788/api/health 2>/dev/null || true)
  if [ "$served" = "$VERSION" ] && [ "$api" = "200" ]; then
    url=$(cd server/dev-stand && docker compose logs tunnel 2>/dev/null | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1)
    echo "OK: стенд поднят с $VERSION${url:+ — $url}"
    exit 0
  fi
  sleep 2
done
echo "ОШИБКА: стенд не поднялся с этим кодом: отдаёт '${served:-ничего}' вместо '$VERSION', /api/health → ${api:-нет ответа}." >&2
echo "Смотри: cd server/dev-stand && docker compose ps && docker compose logs --tail 50" >&2
exit 1
