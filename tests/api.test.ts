import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as state from "../api/state";
import * as remind from "../api/remind";
import * as bot from "../api/telegram";
import { webhookSecret } from "../api/_lib";

// In-memory Upstash + Telegram, so the handlers run end to end.
const db = new Map<string, string>();
const sent: { method: string; payload: Record<string, unknown> }[] = [];
const TOKEN = "123:abc";

beforeEach(() => {
  db.clear();
  sent.length = 0;
  vi.stubEnv("KV_REST_API_URL", "https://redis.test");
  vi.stubEnv("KV_REST_API_TOKEN", "t");
  vi.stubEnv("SYNC_KEY", "secret-key");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("SITE_URL", "https://guitar.test");
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    if (url === "https://redis.test") {
      const [cmd, key, value] = body as string[];
      const result = cmd === "GET" ? (db.get(key) ?? null) : cmd === "SET" ? (db.set(key, value), "OK") : cmd === "DEL" ? Number(db.delete(key)) : null;
      return new Response(JSON.stringify({ result }));
    }
    const method = url.split("/").pop()!;
    sent.push({ method, payload: body });
    return new Response(JSON.stringify({ ok: true, result: method === "getMe" ? { username: "guitar_bot" } : true }));
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const req = (path: string, init: RequestInit & { key?: string | null } = {}) =>
  new Request(`https://guitar.test${path}`, {
    ...init,
    headers: { ...(init.key !== null ? { "x-sync-key": init.key ?? "secret-key" } : {}), ...(init.headers as Record<string, string>) },
  });

function initData(userId: number) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId }) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

const data = { items: [{ id: "a", title: "Гаммы", status: "active" }], sessions: [], practice: { days: [1, 3, 6] } };

describe("/api/state", () => {
  it("rejects a wrong key", async () => {
    expect((await state.GET(req("/api/state", { key: "nope" }))).status).toBe(401);
    expect((await state.GET(req("/api/state", { key: null }))).status).toBe(401);
  });
  it("stores and returns the document with an optimistic lock", async () => {
    expect(await (await state.GET(req("/api/state"))).json()).toEqual({ doc: null });
    const put = (base: number | null, updatedAt: number) =>
      state.PUT(req("/api/state", { method: "PUT", body: JSON.stringify({ updatedAt, base, data }) }));
    expect((await put(null, 1)).status).toBe(200);
    expect((await put(null, 2)).status).toBe(409); // someone else wrote version 1
    expect((await put(1, 2)).status).toBe(200);
    expect((await (await state.GET(req("/api/state"))).json()).doc.updatedAt).toBe(2);
  });
});

describe("Telegram binding and Mini App auth", () => {
  it("binds the owner with the one-time link, then accepts their Mini App data only", async () => {
    const setup = await (await bot.POST(req("/api/telegram?setup=1", { method: "POST" }))).json();
    expect(setup.link).toMatch(/^https:\/\/t\.me\/guitar_bot\?start=[0-9a-f]{24}$/);
    expect(sent.map((s) => s.method)).toEqual(["getMe", "setWebhook", "setChatMenuButton", "setMyCommands"]);
    const code = setup.link.split("start=")[1];

    const update = (text: string, chat = 42, secret = webhookSecret()) =>
      bot.POST(
        new Request("https://guitar.test/api/telegram", {
          method: "POST",
          headers: { "x-telegram-bot-api-secret-token": secret },
          body: JSON.stringify({ message: { chat: { id: chat, type: "private" }, text } }),
        }),
      );
    expect((await update(`/start ${code}`, 42, "forged")).status).toBe(401);
    expect((await update(`/start ${code}`)).status).toBe(200);
    expect(String(sent.at(-1)!.payload.text)).toMatch(/Готово/);

    const asUser = (id: number) => state.GET(req("/api/state", { key: null, headers: { "x-telegram-init-data": initData(id) } }));
    expect((await asUser(42)).status).toBe(200);
    expect((await asUser(7)).status).toBe(403);
    expect((await state.GET(req("/api/state", { key: null, headers: { "x-telegram-init-data": "user=%7B%22id%22%3A42%7D&hash=00" } }))).status).toBe(401);

    // The link is single-use: a stranger can't re-bind with it.
    await update(`/start ${code}`, 99);
    expect((await asUser(42)).status).toBe(200);
  });
});

describe("/api/remind", () => {
  const atNovosibirsk = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };
  const cron = () => remind.GET(new Request("https://guitar.test/api/remind", { headers: { "user-agent": "vercel-cron/1.0" } }));

  beforeEach(() => {
    db.set("guitar:tg_owner", "42");
  });

  it("only answers Vercel Cron or the owner", async () => {
    expect((await remind.GET(new Request("https://guitar.test/api/remind"))).status).toBe(401);
  });
  it("reminds on a practice day without a session, with what's in progress", async () => {
    atNovosibirsk("2026-10-12T12:00:00Z"); // Monday, 19:00 in Novosibirsk
    db.set("guitar:state", JSON.stringify({ updatedAt: 1, data }));
    const r = await (await cron()).json();
    expect(r.sent).toBe(true);
    expect(String(sent.at(-1)!.payload.text)).toContain("• Гаммы");
  });
  it("stays quiet on rest days and after a session", async () => {
    atNovosibirsk("2026-10-13T12:00:00Z"); // Tuesday
    db.set("guitar:state", JSON.stringify({ updatedAt: 1, data }));
    expect((await (await cron()).json()).sent).toBe(false);
    atNovosibirsk("2026-10-12T12:00:00Z");
    db.set("guitar:state", JSON.stringify({ updatedAt: 1, data: { ...data, sessions: [{ date: "2026-10-12" }] } }));
    expect((await (await cron()).json()).sent).toBe(false);
  });
  it("sends a test message on request", async () => {
    atNovosibirsk("2026-10-13T12:00:00Z");
    const r = await (await remind.POST(req("/api/remind?test=1", { method: "POST" }))).json();
    expect(r.sent).toBe(true);
    expect(String(sent.at(-1)!.payload.text)).toMatch(/Бот подключён/);
  });
});
