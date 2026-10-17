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

## Где и как запущен

- Production — [`server/production`](../production/README.md): API, звук и ноты одним compose, данные и секреты в `/srv/guitar`.
- Тестовый стенд — [`server/dev-stand`](../dev-stand/README.md): то же самое со своей базой в `/srv/guitar-dev`.

Переменные: `APP_PASSWORD`, `AUDIO_KEY` и `SCORE_KEY` (ключи к серверам звука и нот), `AUDIO_URL` и `SCORE_URL` (их адреса,
в compose — `http://audio:8080` и `http://score:8080`), `TAVILY_API_KEY`, `TELEGRAM_BOT_TOKEN`, `SITE_URL`, `PUBLIC_URL`,
`TIMEZONE`, `REMIND_HOUR`, `DATA_DIR`, `PORT`, `HOST`.

Первый вход на устройстве, где библиотека уже была в браузере, сливает её с серверной, а файлы из браузера
загружаются на сервер — ничего не теряется.
