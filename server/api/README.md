# API приложения — на своём сервере

Библиотека, табы, записи и дубли хранятся здесь, поэтому на телефоне, компьютере и в Telegram всё одинаковое.
Адреса и ключи серверов звука и нот задаются тут, в `.env`, — в приложении вводить ничего не нужно, кроме пароля
(один раз на каждом устройстве; в Telegram Mini App вход сам).

- `main.ts` — HTTP-сервер и маршруты; `store.ts` — SQLite (`DATA_DIR/guitar.db`) и файлы (`DATA_DIR/files`).
- `session.ts` — вход по паролю (`/api/login` → токен на год), `/api/me` — что умеет сервер.
- `state.ts` — библиотека (одна JSON-запись, слияние на устройствах), `files.ts` — файлы.
- `media.ts` — звук из видео и ноты MuseScore: API сам ходит к `server/youtube-audio` и `server/score-download`
  по `127.0.0.1`, так что их туннели и меняющиеся адреса приложению не нужны.
- `tabs.ts` — поиск табов, `telegram.ts` и `remind.ts` — бот и напоминание в 19:00 в дни занятий.

## .env

```bash
APP_PASSWORD=придумай-длинный-пароль    # смена пароля разлогинит все устройства
AUDIO_KEY=…           # KEY из server/youtube-audio/.env
SCORE_KEY=…           # KEY сервера нот MuseScore (/srv/score-download/.env)
TAVILY_API_KEY=…      # необязательно: ноты MuseScore в поиске табов
# Бот (необязательно):
TELEGRAM_BOT_TOKEN=…
SITE_URL=https://<сайт на vercel>      # что открывает кнопка бота
PUBLIC_URL=https://<адрес этого API>   # куда Telegram шлёт сообщения
TIMEZONE=Asia/Novosibirsk  REMIND_HOUR=19
# Если серверы звука и нот не на стандартных портах: AUDIO_URL=http://127.0.0.1:8787  SCORE_URL=http://127.0.0.1:8790
```

## Тестовый стенд

Свой API со своей базой: `.env` — `/srv/guitar-dev/.env`, данные — `/srv/guitar-dev/data`. Поднимается
`bash server/dev-stand/up.sh` вместе со стендом (тот же адрес, `/api/*`).

## Production (сайт на Vercel)

Один раз:

```bash
sudo mkdir -p /srv/guitar && sudo nano /srv/guitar/.env      # см. выше
git checkout main && bash server/api/up.sh                   # → OK: API поднят
tailscale funnel --bg 8791                                    # постоянный https://<машина>.<сеть>.ts.net
```

Потом в Vercel → проект → Settings → Environment Variables: `VITE_API_URL=https://<машина>.<сеть>.ts.net`
и Redeploy. Бот: в `.env` задай `PUBLIC_URL` (тот же адрес) и `SITE_URL`, затем в приложении
**Настройки → Сервер и Telegram → Подключить бота**.

Обновление после слияния в `main`: `git checkout main && git pull && bash server/api/up.sh`.

Бэкап: папка `/srv/guitar/data` целиком (или «Бэкап» в настройках приложения — только библиотека, без файлов).
Логи: `cd server/api && docker compose logs -f`.

Первый вход на устройстве, где библиотека уже была в браузере, сливает её с серверной, а файлы из браузера
загружаются на сервер — ничего не теряется.
