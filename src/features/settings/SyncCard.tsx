import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { tg } from "@/app/telegram";
import { api, syncEnabled, syncNow, useSync } from "@/store/sync";

/** Sync key, bot binding and a test reminder. */
export function SyncCard() {
  const sync = useSync();
  const [key, setKey] = useState(sync.key);
  const [bot, setBot] = useState<{ bot: string; linked: boolean } | null>(null);
  const [link, setLink] = useState("");
  const [message, setMessage] = useState("");
  const enabled = syncEnabled();

  useEffect(() => {
    if (!enabled) return;
    api<{ bot: string; linked: boolean }>("/api/telegram?status=1")
      .then(setBot)
      .catch(() => setBot(null));
  }, [enabled, sync.key]);

  const run = async (fn: () => Promise<string>) => {
    setMessage("…");
    try {
      setMessage(await fn());
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const connect = () =>
    run(async () => {
      sync.setKey(key.trim());
      await syncNow();
      const err = useSync.getState().error;
      if (err) throw new Error(err);
      return "✅ Синхронизация подключена";
    });

  const setupBot = () =>
    run(async () => {
      const r = await api<{ bot: string; link: string }>("/api/telegram?setup=1", { method: "POST" });
      setLink(r.link);
      return `Бот @${r.bot} настроен. Открой ссылку и нажми Start — ссылка действует час.`;
    });

  const test = () =>
    run(async () => {
      await api("/api/remind?test=1", { method: "POST" });
      return "📨 Сообщение отправлено — проверь Telegram";
    });

  const status = !enabled
    ? location.protocol === "file:"
      ? "Работает только на сайте в Vercel"
      : "Не подключено"
    : sync.error
      ? `⚠️ ${sync.error}`
      : sync.busy
        ? "Синхронизация…"
        : sync.lastOk
          ? `✅ Синхронизировано ${new Date(sync.lastOk).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`
          : "Подключено";

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">
        Данные одни и те же на телефоне, компьютере и в Telegram. Бот в дни занятий напоминает позаниматься.
      </p>
      <div className="text-sm font-semibold">{status}</div>

      {!tg && (
        <div className="flex gap-2">
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder="SYNC_KEY из настроек Vercel"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-base"
          />
          <button type="button" onClick={connect} disabled={!key.trim()} className="h-12 rounded-2xl bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-40">
            Подключить
          </button>
        </div>
      )}

      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => void syncNow()} className="h-12 rounded-2xl bg-surface-2 text-sm font-semibold">
            🔄 Синхронизировать
          </button>
          {sync.key ? (
            <button type="button" onClick={setupBot} className="h-12 rounded-2xl bg-surface-2 text-sm font-semibold">
              🤖 {bot?.linked ? "Перепривязать бота" : "Подключить бота"}
            </button>
          ) : (
            <div />
          )}
          {bot?.linked && (
            <button type="button" onClick={test} className="col-span-2 h-12 rounded-2xl bg-surface-2 text-sm font-semibold">
              📨 Проверить напоминание
            </button>
          )}
        </div>
      )}
      {bot && (
        <p className="text-xs text-muted">
          Бот @{bot.bot}: {bot.linked ? "привязан ✅" : "ещё не привязан"}
        </p>
      )}
      {link && (
        <a href={link} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-2xl bg-accent text-sm font-bold text-on-accent">
          Открыть в Telegram ↗
        </a>
      )}
      {message && <p className="text-sm">{message}</p>}
    </Card>
  );
}
