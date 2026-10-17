import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, CircleAlert, CircleCheck, CircleDashed, ExternalLink, LoaderCircle, LogOut, RefreshCw, Send } from "lucide-react";
import { Badge, Button, Card } from "@/components/ui";
import { tg } from "@/app/telegram";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { syncEnabled, syncNow, useSync } from "@/store/sync";

/** The server: sync status, what it can do, sign-out, bot binding and a test reminder. */
export function SyncCard() {
  const sync = useSync();
  const { token, server, logout } = useAuth();
  const [bot, setBot] = useState<{ bot: string; linked: boolean } | null>(null);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const enabled = syncEnabled();

  useEffect(() => {
    if (!enabled || !server.bot) return;
    api<{ bot: string; linked: boolean }>("/api/telegram?status=1")
      .then(setBot)
      .catch(() => setBot(null));
  }, [enabled, server.bot]);

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
    ? { icon: CircleDashed, tone: "text-muted", text: "Работает только на сайте" }
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

  const features = [
    ["Звук из видео", server.audio],
    ["Ноты с MuseScore", server.score],
    ["Бот", server.bot],
  ] as const;

  return (
    <Card className="space-y-3">
      <p className="text-sm text-muted">
        Библиотека, табы и записи хранятся на твоём сервере — на телефоне, компьютере и в Telegram одно и то же. Адреса и ключи задаются на сервере.
      </p>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <status.icon className={`size-4 shrink-0 ${status.tone}`} />
        {status.text}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {features.map(([label, on]) => (
          <Badge key={label} variant={on ? "good" : "outline"}>
            {label}: {on ? "есть" : "не подключено"}
          </Badge>
        ))}
      </div>

      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => void syncNow()} disabled={sync.busy}>
            <RefreshCw className={`size-4 ${sync.busy ? "animate-spin" : ""}`} /> Синхронизировать
          </Button>
          {token ? (
            <Button variant="secondary" onClick={logout}>
              <LogOut className="size-4" /> Выйти
            </Button>
          ) : (
            <div />
          )}
          {server.bot && token && (
            <Button variant="secondary" onClick={setupBot} disabled={busy} className="col-span-2">
              <Bot className="size-4" /> {bot?.linked ? "Перепривязать бота" : "Подключить бота"}
            </Button>
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
          {tg && <span>· открыто в Telegram</span>}
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
