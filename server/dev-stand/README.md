# Тестовый стенд из ветки dev

Пуш в `dev` → GitHub Actions (`.github/workflows/dev-stand.yml`, копия — `github-workflow.yml` рядом) проверяет код (tsc, тесты, сборка) и по SSH
кладёт сборку в `/srv/guitar-dev/dist` на сервере. Caddy отдаёт её, туннель Cloudflare даёт https-адрес.
Синхронизации и бота на стенде нет (это функции Vercel) — данные живут в браузере.

## Установка (один раз, на сервере)

```bash
# 1. Стенд
cd ~/guitar-mastering-app && git pull && cd server/dev-stand
mkdir -p /srv/guitar-dev/dist && echo "Ждём первую сборку из dev…" > /srv/guitar-dev/dist/index.html
docker compose up -d
sleep 8; docker compose logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1   # адрес стенда

# 2. Ключ, которым GitHub будет заходить на сервер
ssh-keygen -t ed25519 -N "" -C "github-dev-stand" -f ~/.ssh/github-dev-stand
cat ~/.ssh/github-dev-stand.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github-dev-stand        # приватный ключ — целиком в секрет STAND_SSH_KEY
```

3. GitHub → репозиторий → **Settings → Secrets and variables → Actions → New repository secret**:
   - `STAND_HOST` — IP сервера;
   - `STAND_USER` — `root` (или другой пользователь с доступом к `/srv/guitar-dev`);
   - `STAND_SSH_KEY` — приватный ключ из шага 2 (от `-----BEGIN` до `END-----` включительно);
   - `STAND_PORT` — только если SSH не на 22.

4. Проверка: GitHub → **Actions → dev → test stand → Run workflow**, ветка `dev`. Через пару минут стенд обновится.

Если адрес туннеля сменился (перезапуск сервера) — снова последняя команда шага 1.
