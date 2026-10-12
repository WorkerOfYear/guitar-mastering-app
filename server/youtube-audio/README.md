# Звук из YouTube — свой сервер

Vercel и другие облака YouTube не пускает («Sign in to confirm you're not a bot»), поэтому звук из видео
скачивает отдельный маленький сервис на своём сервере. Приложение ходит к нему напрямую из браузера.

- `GET /audio?id=<id видео>` с заголовком `Authorization: Bearer <KEY>` → аудио (m4a, если есть).
- Принимает только id видео YouTube — сервер нельзя заставить качать произвольные ссылки.
- Без ключа отвечает 401. Одновременно — не больше двух скачиваний, видео не длиннее 30 минут.
- yt-dlp обновляется сам при запуске и раз в сутки (YouTube часто всё меняет).

## Установка (один раз)

Нужны Linux-сервер с открытыми портами 80 и 443 и Docker.

```bash
# 1. Docker (если ещё нет)
curl -fsSL https://get.docker.com | sh

# 2. Код
git clone https://github.com/WorkerOfYear/guitar-mastering-app.git
cd guitar-mastering-app/server/youtube-audio

# 3. Ключ и адрес. Адрес без своего домена: IP через дефисы + .sslip.io (1.2.3.4 → 1-2-3-4.sslip.io)
IP=$(curl -s https://api.ipify.org)
echo "KEY=$(openssl rand -hex 24)" > .env
echo "DOMAIN=${IP//./-}.sslip.io" >> .env
cat .env

# 4. Запуск (Caddy сам получит HTTPS-сертификат)
docker compose up -d --build
```

Через минуту проверь: `curl https://<DOMAIN>/health` → `ok`.

Потом в приложении: **Настройки → Звук из YouTube** — вставь `DOMAIN` и `KEY` из `.env`, нажми «Проверить».
Делается один раз на каждом устройстве (телефон, Telegram, компьютер).

## Обновление и логи

```bash
cd guitar-mastering-app && git pull && cd server/youtube-audio && docker compose up -d --build
docker compose logs -f audio
```

Если порты 80/443 уже заняты (например, nginx), убери сервис `caddy` из `compose.yaml`, открой у `audio`
порт `8080` и проксируй на него свой домен с HTTPS.
