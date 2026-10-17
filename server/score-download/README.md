# Ноты с MuseScore — свой сервер

> Обычно сервис поднимается не сам по себе, а вместе с API в [`server/production`](../production/README.md)
> (и на стенде — в [`server/dev-stand`](../dev-stand/README.md)): там ему не нужны ни туннель, ни HTTPS, ни порт `8790`,
> а ключ берётся из `score.env` (`SCORE_KEY`). Ниже — как запустить его отдельно.

Сервис скачивает ноты с MuseScore по ссылке: MusicXML, PDF, MIDI или mp3. К нему ходит API приложения.

- `GET /score?url=<ссылка на ноты musescore.com>&type=musicxml|pdf|midi|mp3` с заголовком `Authorization: Bearer <KEY>` → файл.
- Принимает только ссылки `https://musescore.com/…` и четыре формата — сервер нельзя заставить качать произвольные адреса.
- Без ключа отвечает 401. Скачивает по одному запросу за раз. MIDI и mp3 — секунд 10, PDF на 70 страниц — около 25, MusicXML — 20–40.
- MusicXML (`.mxl`) приложение сразу ставит табами песни, mp3 — записью, PDF и MIDI сохраняются файлом.
- MusicXML отдаёт только кнопка «Download» на сайте, и только со входом в аккаунт MuseScore и только для бесплатных нот.
  У платных («Buy this score») сервис ответит, что они платные. Аккаунт лучше завести отдельный: за автоматическое
  скачивание его могут заблокировать.
- Скачивание нот обходит ограничения MuseScore — пользуйся для себя и на свой риск.

## Как устроено

MuseScore закрыт проверкой Cloudflare. Браузер её проходит, а curl и Node (в том числе
[dl-librescore](https://github.com/LibreScore/dl-librescore)) получают 403 — даже с домашнего интернета.
Поэтому сервис собран на образе [FlareSolverr](https://github.com/FlareSolverr/FlareSolverr): его Chrome открывает
страницу нот и проходит проверку. Дальше — способ dl-librescore, но изнутри этой страницы: ключ API
(`md5(id + тип + страница + суффикс из скрипта сайта)`), запрос `/api/jmuse` за ссылкой на файл, сам файл — с хранилища
MuseScore, где проверки нет. PDF печатает тот же Chrome из картинок страниц.
MusicXML — та же кнопка «Download → MusicXML», что на сайте: Chrome входит в аккаунт (`MS_EMAIL`, `MS_PASSWORD`),
cookies входа лежат в `data/cookies.json`, так что логин нужен редко.

Chrome занимает до 1 ГБ памяти, пока работает, и закрывается после 10 минут без запросов.
Если MuseScore поменяет сайт, сервис может сломаться — ошибка будет в ответе и в `docker compose logs score`.

## Установка (один раз)

```bash
mkdir -p /srv/score-download/data && cp server/score-download/{Dockerfile,compose.yaml,server.py} /srv/score-download/
cd /srv/score-download
chown 1000:1000 data                       # пользователь внутри образа FlareSolverr
echo "KEY=$(openssl rand -hex 24)" > .env
# для MusicXML — аккаунт MuseScore:
echo "MS_EMAIL=почта@example.com" >> .env
echo "MS_PASSWORD=пароль" >> .env
chmod 600 .env
docker compose up -d --build
curl http://127.0.0.1:8790/health          # → ok
```

Сервис слушает только `127.0.0.1:8790`. HTTPS снаружи — туннель Cloudflare, как у [звука из YouTube](../youtube-audio/README.md):

```bash
docker run -d --name score-tunnel --restart unless-stopped --network host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:8790
docker logs score-tunnel 2>&1 | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -1   # адрес
```

Адрес туннеля меняется при перезапуске контейнера `score-tunnel` или сервера.

Потом в приложении: **Настройки → Остальные настройки → Ноты с MuseScore** — адрес (`https://…`) и `KEY` из `.env`, «Проверить».
Ссылка на ноты MuseScore прикрепляется к песне (поиск табов → ноты MuseScore); в «Материалах» песни появятся кнопки PDF, MIDI, MP3.

## Обновление и логи

```bash
cp server/score-download/{Dockerfile,compose.yaml,server.py} /srv/score-download/
cd /srv/score-download && docker compose build --pull && docker compose up -d
docker compose logs -f score
```

`--pull` берёт свежий FlareSolverr — он догоняет изменения Cloudflare.
