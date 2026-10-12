# Правила для Claude в этом репозитории

## Публикация изменений

- Правки идут в ветку **`dev`**. В `main` — только когда владелец скажет («сливай в main» и т.п.).
  Vercel деплоит production из `main`; на `dev` он собирает preview (адрес — в Vercel → Deployments).
- Порядок для каждой законченной и проверенной правки: коммит в рабочую ветку → `git push` рабочей ветки →
  `git fetch origin dev` → если `dev` является предком текущего коммита, `git push origin HEAD:dev` (fast-forward).
  Если `dev` ушёл вперёд — сначала влей его в рабочую ветку (`git merge origin/dev`), прогони проверки и только потом пушь.
- Слияние в `main` по команде: `git fetch origin main dev` → если `main` — предок `dev`, `git push origin origin/dev:main`
  (fast-forward), иначе влить `main` в `dev`, проверить и запушить.
- Перед заливкой должны проходить: `npx tsc --noEmit`, `npm test`, `npm run build`. Сломанное в `dev` и `main` не лей.
- Никогда не делай force-push в `main` и `dev`.
- Автор коммитов — владелец репозитория: `git config user.name "WorkerOfYear"`, `git config user.email "artyomlufirenko@gmail.com"`.
  Vercel (тариф Hobby) не деплоит коммиты авторов не из команды. Строку `Co-Authored-By` в сообщении коммита оставляй.
- Рабочие ветки `claude/**` Vercel не собирает (`git.deploymentEnabled` в `vercel.json`).

## Проект

- Интерфейс и тексты — на русском.
- Требования: `docs/PRD.md`, описание и настройка деплоя: `README.md`.
