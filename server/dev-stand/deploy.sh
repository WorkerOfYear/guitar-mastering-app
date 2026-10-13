#!/usr/bin/env bash
# Builds what the test stand needs and uploads it; run by .github/workflows/dev-stand.yml after the checks.
# Lives in the repo, not in the workflow, so changing the deploy is an ordinary commit.
# Env: HOST, USER, PORT, TARGET (…/dist), KEY (private SSH key).
set -euo pipefail

npm run build
npm run build:stand-api

mkdir -p ~/.ssh
printf '%s\n' "$KEY" > ~/.ssh/stand && chmod 600 ~/.ssh/stand
ssh-keyscan -p "$PORT" "$HOST" >> ~/.ssh/known_hosts 2>/dev/null
SSH="ssh -i $HOME/.ssh/stand -p $PORT"

# The app: upload next to the live copy, then swap, so the stand never serves a half-copied build.
$SSH "$USER@$HOST" "mkdir -p '$TARGET.new' && rm -rf '$TARGET.new'/*"
rsync -az --delete -e "$SSH" dist/ "$USER@$HOST:$TARGET.new/"
$SSH "$USER@$HOST" "rm -rf '$TARGET.old' && { [ ! -d '$TARGET' ] || mv '$TARGET' '$TARGET.old'; } && mv '$TARGET.new' '$TARGET'"

# Tab search (server/dev-stand/api.ts): the bundled function next to dist, then restart its container.
API="${TARGET%/*}/api"
$SSH "$USER@$HOST" "mkdir -p '$API'"
rsync -az --delete -e "$SSH" dist-api/ "$USER@$HOST:$API/"
$SSH "$USER@$HOST" "docker restart guitar-dev-api >/dev/null" ||
  echo "::warning::guitar-dev-api не перезапущен — на сервере: cd server/dev-stand && docker compose up -d"

echo "Deployed $(git rev-parse --short HEAD)" >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
