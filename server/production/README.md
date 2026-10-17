# Production на своём сервере

Один compose со всем, что нужно приложению: API ([`server/api`](../api/README.md)), звук из видео
([`server/youtube-audio`](../youtube-audio/README.md)) и ноты MuseScore ([`server/score-download`](../score-download/README.md)).
Сервисы видят друг друга во внутренней сети docker, наружу торчит только API на `127.0.0.1:8791`, а HTTPS даёт Tailscale Funnel.
Сайт на Vercel ходит к API по адресу из `VITE_API_URL`.

## Папка `/srv/guitar`

```
.env         секреты API
audio.env    AUDIO_KEY=…                       (ключ между API и сервером звука, придумай любой длинный)
score.env    SCORE_KEY=…  MS_EMAIL=…  MS_PASSWORD=…   (MS_* — аккаунт MuseScore для MusicXML, необязательно)
data/        библиотека (guitar.db) и файлы — это и есть все данные, бэкапь её
audio/       cookies.txt для Instagram, необязательно (README сервера звука)
score/       вход в MuseScore, создаётся сам
api/         собранный API, кладёт up.sh
```

`.env`:

```bash
APP_PASSWORD=придумай-длинный-пароль    # смена пароля разлогинит все устройства
TAVILY_API_KEY=…      # необязательно: ноты MuseScore в поиске табов
# Бот (необязательно):
TELEGRAM_BOT_TOKEN=…
SITE_URL=https://<сайт на vercel>      # что открывает кнопка бота
PUBLIC_URL=https://<адрес API>         # куда Telegram шлёт сообщения
TIMEZONE=Asia/Novosibirsk
REMIND_HOUR=19
```

Сервер звука видит только `audio.env`, сервер нот — только `score.env`; API читает все три файла.

## Запуск и обновление

```bash
git checkout main && git pull && bash server/production/up.sh      # → OK: production поднят
tailscale funnel --bg 8791                                          # один раз: https://<машина>.<сеть>.ts.net
```

Потом в Vercel → проект → Settings → Environment Variables: `VITE_API_URL=https://<машина>.<сеть>.ts.net` и Redeploy.
Бот: в `.env` задай `TELEGRAM_BOT_TOKEN`, `SITE_URL`, `PUBLIC_URL`, затем в приложении
**Настройки → Сервер и Telegram → Подключить бота**.

```bash
cd server/production
docker compose up -d --force-recreate     # после правки любого .env
docker compose stop                       # выключить всё, данные остаются
docker compose ps
docker compose logs -f api
```

Тестовый стенд (`server/dev-stand`) — такой же набор со своими данными в `/srv/guitar-dev`.
