# Звук из YouTube — свой сервер

Vercel и другие облака YouTube не пускает («Sign in to confirm you're not a bot»), поэтому звук из видео
скачивает отдельный маленький сервис на своём сервере. Приложение ходит к нему напрямую из браузера.

- `GET /audio?id=<id видео>` с заголовком `Authorization: Bearer <KEY>` → аудио (m4a, если есть).
- Принимает только id видео YouTube — сервер нельзя заставить качать произвольные ссылки.
- Без ключа отвечает 401. Одновременно — не больше двух скачиваний, видео не длиннее 30 минут.
- yt-dlp обновляется сам при запуске и раз в сутки (YouTube часто всё меняет).

Приложение открыто по https, поэтому и сервису нужен HTTPS-адрес.

## Установка (один раз)

```bash
git clone https://github.com/WorkerOfYear/guitar-mastering-app.git
cd guitar-mastering-app/server/youtube-audio
echo "KEY=$(openssl rand -hex 24)" > .env
docker compose up -d --build
curl http://127.0.0.1:8787/health          # → ok
```

Сервис слушает только `127.0.0.1:8787`. HTTPS снаружи — один из вариантов:

### А. Tailscale Funnel (порты 80/443 не нужны)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up                      # откроет ссылку для входа (Google/GitHub/…)
tailscale funnel --bg 8787        # покажет адрес https://<машина>.<сеть>.ts.net
```

Если funnel попросит включить HTTPS/Funnel для сети — открой ссылку из сообщения и подтверди.

### Б. Caddy, если порты 80 и 443 свободны

```bash
IP=$(curl -s https://api.ipify.org)
echo "DOMAIN=${IP//./-}.sslip.io" >> .env
docker compose --profile caddy up -d --build
```

### В. Свой reverse proxy (nginx и т.п.) с HTTPS — проксируй домен на `127.0.0.1:8787`.

Потом в приложении: **Настройки → Звук из YouTube** — адрес (`https://…`) и `KEY` из `.env`, «Проверить».
Делается один раз на каждом устройстве (телефон, Telegram, компьютер).

## Обновление и логи

```bash
cd guitar-mastering-app && git pull && cd server/youtube-audio && docker compose up -d --build
docker compose logs -f audio
```
