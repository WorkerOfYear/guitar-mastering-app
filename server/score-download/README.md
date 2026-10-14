# Ноты с MuseScore — свой сервер

MuseScore закрыт проверкой Cloudflare, и облака вроде Vercel её не проходят. Поэтому ноты скачивает отдельный маленький сервис
на своём сервере: он запускает [dl-librescore](https://github.com/LibreScore/dl-librescore). Приложение ходит к нему напрямую из браузера.

- `GET /score?url=<ссылка на ноты musescore.com>&type=pdf|midi|mp3` с заголовком `Authorization: Bearer <KEY>` → файл.
- Принимает только ссылки `https://musescore.com/…` и три формата — сервер нельзя заставить качать произвольные адреса.
- Без ключа отвечает 401. Одновременно — не больше двух скачиваний.
- По ссылке dl-librescore отдаёт только PDF, MIDI и mp3. MusicXML он делает лишь из файла `.mscz` на диске, поэтому
  табы в приложение так не попадут: PDF и MIDI сохраняются файлом, mp3 становится записью песни.
- Скачивание нот обходит ограничения MuseScore — пользуйся для себя и на свой риск.
- Работает ли сервер с твоего IP, зависит от Cloudflare: если MuseScore отдаёт проверку, скачивание не удастся.

## Установка (один раз)

```bash
cd guitar-mastering-app/server/score-download
echo "KEY=$(openssl rand -hex 24)" > .env
docker compose up -d --build
curl http://127.0.0.1:8790/health          # → ok
```

Сервис слушает только `127.0.0.1:8790`. HTTPS снаружи — как у [звука из YouTube](../youtube-audio/README.md)
(Tailscale Funnel: `tailscale funnel --bg 8790`, или свой reverse proxy на `127.0.0.1:8790`).

Потом в приложении: **Настройки → Остальные настройки → Ноты с MuseScore** — адрес (`https://…`) и `KEY` из `.env`, «Проверить».
Ссылка на ноты MuseScore прикрепляется к песне (поиск табов → «Ноты на MuseScore»); в «Материалах» песни появятся кнопки PDF, MIDI, MP3.

## Обновление и логи

```bash
cd guitar-mastering-app && git pull && cd server/score-download && docker compose build --no-cache && docker compose up -d
docker compose logs -f score
```
