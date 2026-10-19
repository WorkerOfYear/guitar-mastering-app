# Тестовый стенд

Разработка идёт прямо на сервере, в клоне репозитория. После каждой правки:

```bash
bash server/dev-stand/up.sh
```

Скрипт проверяет код (`tsc`, тесты), собирает приложение и API ([`server/api`](../api/README.md)), кладёт их в `/srv/guitar-dev/dist`
и `/srv/guitar-dev/api`, перезапускает контейнер `api` и проверяет, что стенд отдаёт именно эту сборку.
В конце — `OK: стенд поднят с <коммит>` и адрес стенда; иначе `ОШИБКА` и ненулевой код выхода.
Какая версия на стенде сейчас: `<адрес стенда>/version.txt` (коммит, `+changes` — если были незакоммиченные правки, и время сборки).

- Node на сервере не обязателен: если `npm` нет, сборка идёт в контейнере `node:22-alpine`.
- `SKIP_CHECKS=1 bash server/dev-stand/up.sh` — без `tsc` и тестов (быстрее, для мелочей).
- `STAND_DIR=…` — другая папка вместо `/srv/guitar-dev`.

Стенд — тот же набор сервисов, что [production](../production/README.md) (API, звук из видео, ноты MuseScore),
со своими данными, плюс Caddy и туннель Cloudflare: Caddy отдаёт сборку на `127.0.0.1:8788`, `/api/*` уходит в API
стенда, туннель даёт https-адрес. Production-данные стенд не трогает.

Данные и секреты стенда — в `/srv/guitar-dev` (не в git, не зависит от того, из какого клона запущен `up.sh`):
`.env` (`APP_PASSWORD` — пароль входа на стенд, `TAVILY_API_KEY`), `audio.env` (`AUDIO_KEY`), `score.env`
(`SCORE_KEY`, `MS_EMAIL`, `MS_PASSWORD`), `data/`. После правки: `cd server/dev-stand && docker compose up -d --force-recreate api audio score`
(без `tunnel` — иначе сменится адрес).

## Установка (один раз)

```bash
cd ~/guitar-mastering-app && git pull
bash server/dev-stand/up.sh          # соберёт, поднимет контейнеры (docker compose up -d) и напечатает адрес
```

Если адрес туннеля сменился (перезапуск сервера):
`cd server/dev-stand && docker compose logs tunnel | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1`

Раньше стенд обновлялся из GitHub Actions по пушу в `dev`; это убрано. Секреты `STAND_*` в настройках репозитория
и ключ `~/.ssh/github-dev-stand` на сервере больше не нужны — их можно удалить.

Ноты MuseScore в поиске табов: ключ Tavily или Serper в `/srv/guitar-dev/.env` (`TAVILY_API_KEY=…` или `SERPER_API_KEY=…`)
и перезапуск, как выше. Как получить ключ — в README в корне.
