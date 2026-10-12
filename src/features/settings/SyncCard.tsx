import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, CircleAlert, CircleCheck, CircleDashed, ExternalLink, LoaderCircle, RefreshCw, Send } from "lucide-react";
import { Badge, Button, Card, Input } from "@/components/ui";
import { tg } from "@/app/telegram";
import { api, syncEnabled, syncNow, useSync } from "@/store/sync";

/** Sync key, bot binding and a test reminder. */
export function SyncCard() {
  const sync = useSync();
  const [key, setKey] = useState(sync.key);
  const [bot, setBot] = useState<{ bot: string; linked: boolean } | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = syncEnabled();

  useEffect(() => {
    if (!enabled) return;
    api<{ bot: string; linked: boolean }>("/api/telegram?status=1")
      .then(setBot)
      .catch(() => setBot(null));
  }, [enabled, sync.key]);

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.success(await fn());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const connect = () =>
    run(async () => {
      sync.setKey(key.trim());
      await syncNow();
      const err = useSync.getState().error;
      if (err) throw new Error(err);
      return "Синхронизация подключена";
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
      return "Сообщение отправлено — проверь Telegram";
    });

  const status = !enabled
    ? { icon: CircleDashed, tone: "text-muted", text: location.protocol === "file:" ? "Работает только на сайте в Vercel" : "Не подключено" }
    : sync.error
      ? { icon: CircleAlert, tone: "text-guide", text: sync.error }
      : sync.busy
        ? { icon: LoaderCircle, tone: "text-muted animate-spin", text: "Синхронизация…" }
        : sync.lastOk
          ? {
              icon: CircleCheck,
              tone: "text-good",
              text: `Синхронизировано ${new Date(sync.lastOk).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
            }
          : { icon: CircleCheck, tone: "text-good", text: "Подключено" };

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">Данные одни и те же на телефоне, компьютере и в Telegram. Бот в дни занятий напоминает позаниматься.</p>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <status.icon className={`size-4 shrink-0 ${status.tone}`} />
        {status.text}
      </div>

      {!tg && (
        <div className="flex gap-2">
          <Input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder="SYNC_KEY из настроек Vercel"
            className="flex-1"
          />
          <Button onClick={connect} disabled={!key.trim() || busy}>
            Подключить
          </Button>
        </div>
      )}

      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void syncNow()} disabled={sync.busy}>
            <RefreshCw className={`size-4 ${sync.busy ? "animate-spin" : ""}`} /> Синхронизировать
          </Button>
          {sync.key ? (
            <Button variant="secondary" onClick={setupBot} disabled={busy}>
              <Bot className="size-4" /> {bot?.linked ? "Перепривязать бота" : "Подключить бота"}
            </Button>
          ) : (
            <div />
          )}
          {bot?.linked && (
            <Button variant="secondary" onClick={test} disabled={busy} className="col-span-2">
              <Send className="size-4" /> Проверить напоминание
            </Button>
          )}
        </div>
      )}
      {bot && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Bot className="size-4" /> @{bot.bot}
          <Badge variant={bot.linked ? "good" : "outline"}>{bot.linked ? "привязан" : "ещё не привязан"}</Badge>
        </p>
      )}
      {link && (
        <Button asChild className="w-full">
          <a href={link} target="_blank" rel="noreferrer">
            Открыть в Telegram <ExternalLink className="size-4" />
          </a>
        </Button>
      )}
    </Card>
  );
}
