// Shared helpers for the serverless functions (files starting with "_" are not exposed as routes).
// Same design as my-english-vocab: one JSON document in Upstash Redis, auth by SYNC_KEY or Telegram Mini App data.
import crypto from "node:crypto";

const KEY_STATE = "guitar:state";
const KEY_OWNER = "guitar:tg_owner"; // chat id of the owner (private chat id == Telegram user id)
export const KEY_LINK = "guitar:tg_link"; // one-time code for t.me/<bot>?start=<code>

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export const handle =
  (fn: (req: Request) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (e) {
      const err = e as Partial<HttpError>;
      return json({ error: err.message ?? "Ошибка сервера" }, err.status ?? 500);
    }
  };

// ---------- storage: Upstash Redis REST API (Vercel Marketplace → Upstash for Redis)
// Vercel may prefix the variable names (e.g. STORAGE_KV_REST_API_URL), so match by suffix.
const envBySuffix = (re: RegExp) => {
  const name = Object.keys(process.env).find((k) => re.test(k) && !/READ_ONLY/.test(k) && process.env[k]);
  return name ? process.env[name] : undefined;
};

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || envBySuffix(/(KV_REST_API|REDIS_REST)_URL$/);
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || envBySuffix(/(KV_REST_API|REDIS_REST)_TOKEN$/);
  if (!url || !token) throw new HttpError(500, "Хранилище не подключено: добавь Upstash for Redis в Vercel → Storage");
  return { url, token };
}

export async function redis(...command: (string | number)[]): Promise<unknown> {
  const { url, token } = redisConfig();
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const data = (await r.json().catch(() => ({}))) as { result?: unknown; error?: string };
  if (!r.ok || data.error) throw new HttpError(502, "Ошибка хранилища: " + (data.error || r.status));
  return data.result;
}

/** Subset of the client's DataState that the server reads. */
export interface ServerData {
  items?: { id: string; title: string; status: string; warmup?: boolean; sections?: { id: string; title: string; status: string }[] }[];
  sessions?: { date: string }[];
  lastPlayed?: Record<string, string>;
  practice?: { days?: number[]; blocks?: Record<string, number> };
}

export interface StateDoc {
  updatedAt: number;
  data: ServerData;
}

export async function loadState(): Promise<StateDoc | null> {
  const raw = (await redis("GET", KEY_STATE)) as string | null;
  return raw ? (JSON.parse(raw) as StateDoc) : null;
}
export const saveState = (doc: StateDoc) => redis("SET", KEY_STATE, JSON.stringify(doc));

export async function ownerId(): Promise<string | null> {
  return process.env.TELEGRAM_CHAT_ID || ((await redis("GET", KEY_OWNER)) as string | null) || null;
}
export const setOwner = (id: string) => redis("SET", KEY_OWNER, id);

// ---------- auth
export const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function checkSyncKey(req: Request) {
  const expected = process.env.SYNC_KEY;
  if (!expected) throw new HttpError(500, "На сервере не задан SYNC_KEY");
  const got = req.headers.get("x-sync-key");
  if (!got || !safeEqual(got, expected)) throw new HttpError(401, "Неверный ключ синхронизации");
}

// Telegram Mini App launch data, signed with the bot token:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: string, maxAgeSec = 7 * 24 * 3600): { id: number } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (!safeEqual(hash, expected)) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date") || 0) > maxAgeSec) return null;
  try {
    return JSON.parse(params.get("user") || "null");
  } catch {
    return null;
  }
}

/** Either the sync key (website) or valid Mini App data from the bot's owner (inside Telegram). */
export async function checkAuth(req: Request) {
  const init = req.headers.get("x-telegram-init-data");
  if (init && !req.headers.get("x-sync-key")) {
    const user = verifyInitData(init);
    if (!user) throw new HttpError(401, "Не удалось проверить вход через Telegram — открой приложение заново");
    const owner = await ownerId();
    if (!owner || String(user.id) !== String(owner)) throw new HttpError(403, "Это личное приложение: бот привязан к другому аккаунту");
    return;
  }
  checkSyncKey(req);
}

/** Secret Telegram sends back with every webhook call, so nobody else can post fake updates. */
export function webhookSecret() {
  const base = process.env.WEBHOOK_SECRET || process.env.SYNC_KEY || "";
  return crypto.createHash("sha256").update("webhook:" + base).digest("hex").slice(0, 48);
}

// ---------- dates in the owner's time zone
const TIMEZONE = () => process.env.TIMEZONE || "Asia/Novosibirsk";

export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE(), year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export const weekdayToday = () => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE(), weekday: "short" }).format(new Date());
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
};

// ---------- Telegram
export async function telegram<T = unknown>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new HttpError(500, "На сервере не задан TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await r.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new HttpError(502, "Telegram: " + (data.description || r.status));
  return data.result as T;
}

export function siteUrl(req: Request) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return new URL(req.url).origin;
}

/** Button that opens the site inside Telegram as a Mini App. */
export const appButton = (req: Request, text: string, page = "") => ({
  text,
  web_app: { url: `${siteUrl(req)}/${page ? `?page=${page}` : ""}` },
});

// ---------- reminder text
const DEFAULT_DAYS = [1, 3, 6];

/** Mirrors the client planner closely enough for a reminder: active units, least recently played first. */
function activeUnits(data: ServerData) {
  const played = data.lastPlayed ?? {};
  const units: { key: string; title: string }[] = [];
  for (const i of data.items ?? []) {
    if (i.warmup || i.status !== "active") continue;
    const secs = i.sections ?? [];
    if (secs.length) {
      const own = secs.filter((s) => s.status === "active");
      const pick = own.length ? own : secs.filter((s) => s.status === "queue").slice(0, 1);
      for (const s of pick) units.push({ key: `${i.id}#${s.id}`, title: `${i.title}: ${s.title}` });
    } else units.push({ key: i.id, title: i.title });
  }
  return units.sort((a, b) => (played[a.key] ?? "").localeCompare(played[b.key] ?? ""));
}

export function reminderState(doc: StateDoc | null) {
  const data = doc?.data ?? {};
  const isDay = (data.practice?.days ?? DEFAULT_DAYS).includes(weekdayToday());
  const done = (data.sessions ?? []).some((s) => s.date === today());
  const minutes = Object.values(data.practice?.blocks ?? {}).reduce((a, b) => a + b, 0) || 60;
  return { isDay, done, minutes, next: activeUnits(data).slice(0, 2).map((u) => u.title) };
}

const DAY_NAMES = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
export const practiceDaysText = (doc: StateDoc | null) =>
  [1, 2, 3, 4, 5, 6, 0].filter((d) => (doc?.data.practice?.days ?? DEFAULT_DAYS).includes(d)).map((d) => DAY_NAMES[d]).join(", ");

export function reminderText(next: string[], minutes = 60) {
  const lines = [`🎸 Сегодня занятие — ${minutes} минут.`, "", "🔥 Разминка · 🧩 Разбор нового · 🔁 Повторение · 🎶 Импровизация"];
  if (next.length) lines.push("", "В работе:", ...next.map((t) => `• ${t}`));
  return lines.join("\n");
}
