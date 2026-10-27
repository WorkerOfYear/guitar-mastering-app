# Правила для Claude в этом репозитории

## Публикация изменений

- Правки идут в ветку **`dev`**. В `main` — только когда владелец скажет («сливай в main» и т.п.).
  Vercel деплоит production из `main`; ветку `dev` Vercel не собирает.
- **Сборка, стенд и заливка — только по команде `/build`** (`.claude/commands/build.md`). После правок сам не запускай
  `up.sh`, проверки и коммиты: правки копятся в рабочей копии, владелец смотрит их и пишет `/build`.
  По `/build` — `bash server/dev-stand/up.sh` (стенд не обновляется пушем), в конце должно быть `OK: стенд поднят с <коммит>`
  и `<адрес стенда>/version.txt` с этим коммитом; если `npm` нет — см. `server/dev-stand/README.md`.
- Порядок заливки по `/build`: коммит в рабочую ветку → `git push` рабочей ветки →
  `git fetch origin dev` → если `dev` является предком текущего коммита, `git push origin HEAD:dev` (fast-forward).
  Если `dev` ушёл вперёд — сначала влей его в рабочую ветку (`git merge origin/dev`), прогони проверки и только потом пушь (затем обнови стенд, см. выше).
- Слияние в `main` по команде: `git fetch origin main dev` → если `main` — предок `dev`, `git push origin origin/dev:main`
  (fast-forward), иначе влить `main` в `dev`, проверить и запушить. Сразу после — обнови production-API на сервере
  кодом из `main`: `bash server/production/up.sh` из чекаута `origin/main` (см. `server/production/README.md`), дождись `OK: production поднят`.
- Перед заливкой должны проходить: `npx tsc --noEmit`, `npm test`, `npm run build`. Сломанное в `dev` и `main` не лей.
- Никогда не делай force-push в `main` и `dev`.
- Автор коммитов — владелец репозитория: `git config user.name "WorkerOfYear"`, `git config user.email "artyomlufirenko@gmail.com"`.
  Vercel (тариф Hobby) не деплоит коммиты авторов не из команды. Строку `Co-Authored-By` в сообщении коммита оставляй.
- Рабочие ветки `claude/**` и `dev` Vercel не собирает (`git.deploymentEnabled` в `vercel.json`).

## Тестовый стенд

- Разработка идёт на сервере владельца, рядом с тестовым стендом (`server/dev-stand`). Автодеплоя из GitHub нет.
- Production — один compose `server/production` (API, звук, ноты), стенд — `server/dev-stand` (то же плюс Caddy и туннель).
  Данные и секреты: production — `/srv/guitar`, стенд — `/srv/guitar-dev` (`.env`, `audio.env`, `score.env`, `data/`).
  Не удаляй и не перезаписывай `data/` и `*.env` — там библиотека и пароли владельца.
- По `/build` стенд должен заработать с этим кодом: запусти `bash server/dev-stand/up.sh` и дождись строки
  `OK: стенд поднят с …`. Скрипт проверяет код, собирает, выкладывает, перезапускает `api` и сверяет `/version.txt`.
  `ОШИБКА` — разберись и почини (логи: `cd server/dev-stand && docker compose logs --tail 50`); правка не готова,
  пока стенд её не показывает. В ответе владельцу укажи адрес стенда из вывода скрипта.
- Если работаешь не на сервере (облачная сессия, нет docker и `/srv/guitar-dev`) — стенд обновить нельзя:
  скажи владельцу, что после `git pull` на сервере нужно запустить `bash server/dev-stand/up.sh`.

## Проект

- Интерфейс и тексты — на русском.
- Требования: `docs/PRD.md`, описание и настройка деплоя: `README.md`.
