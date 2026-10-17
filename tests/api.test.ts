import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as state from "../server/api/state";
import * as remind from "../server/api/remind";
import * as bot from "../server/api/telegram";
import * as files from "../server/api/files";
import * as session from "../server/api/session";
import * as media from "../server/api/media";
import { issueToken, webhookSecret } from "../server/api/lib";
import { closeStore, kvGet, kvSet } from "../server/api/store";

// A fresh SQLite in a temp folder and a fake Telegram, so the handlers run end to end.
const sent: { method: string; payload: Record<string, unknown> }[] = [];
const TOKEN = "123:abc";
let dataDir = "";
let auth = "";

beforeEach(() => {
  sent.length = 0;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "guitar-api-"));
  vi.stubEnv("DATA_DIR", dataDir);
  vi.stubEnv("APP_PASSWORD", "secret-password");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", TOKEN);
  vi.stubEnv("SITE_URL", "https://guitar.test");
  auth = issueToken();
  vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const method = url.split("/").pop()!;
    sent.push({ method, payload: body });
    return new Response(JSON.stringify({ ok: true, result: method === "getMe" ? { username: "guitar_bot" } : true }));
  });
});
afterEach(() => {
  closeStore();
  fs.rmSync(dataDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const req = (path: string, init: RequestInit & { token?: string | null } = {}) =>
  new Request(`https://guitar.test${path}`, {
    ...init,
    headers: { ...(init.token !== null ? { authorization: `Bearer ${init.token ?? auth}` } : {}), ...(init.headers as Record<string, string>) },
  });

function initData(userId: number) {
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId }) });
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

const data = { items: [{ id: "a", title: "Гаммы", status: "active" }], sessions: [], practice: { days: [1, 3, 6] } };

describe("/api/login", () => {
  const login = (password: string, ip = "1.2.3.4") =>
    session.login(new Request("https://guitar.test/api/login", { method: "POST", headers: { "x-forwarded-for": ip }, body: JSON.stringify({ password }) }));
  it("gives a token for the right password, and the token opens the API", async () => {
    expect((await login("nope")).status).toBe(401);
    const { token } = await (await login("secret-password")).json();
    expect((await state.GET(req("/api/state", { token }))).status).toBe(200);
  });
  it("slows down guessing", async () => {
    for (let i = 0; i < 5; i++) expect((await login("nope", "6.6.6.6")).status).toBe(401);
    expect((await login("secret-password", "6.6.6.6")).status).toBe(429);
    expect((await login("secret-password", "7.7.7.7")).status).toBe(200);
  });
  it("signs every device out when the password changes", async () => {
    vi.stubEnv("APP_PASSWORD", "another-password");
    expect((await state.GET(req("/api/state"))).status).toBe(401);
  });
});

describe("/api/state", () => {
  it("rejects a wrong or missing token", async () => {
    expect((await state.GET(req("/api/state", { token: "123.abc" }))).status).toBe(401);
    expect((await state.GET(req("/api/state", { token: null }))).status).toBe(401);
    const expired = `${Math.floor(Date.now() / 1000) - 10}.${auth.split(".")[1]}`;
    expect((await state.GET(req("/api/state", { token: expired }))).status).toBe(401);
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

    const asUser = (id: number) => state.GET(req("/api/state", { token: null, headers: { "x-telegram-init-data": initData(id) } }));
    expect((await asUser(42)).status).toBe(200);
    expect((await asUser(7)).status).toBe(403);
    expect((await state.GET(req("/api/state", { token: null, headers: { "x-telegram-init-data": "user=%7B%22id%22%3A42%7D&hash=00" } }))).status).toBe(401);

    // The link is single-use: a stranger can't re-bind with it.
    await update(`/start ${code}`, 99);
    expect((await asUser(42)).status).toBe(200);
  });
});

describe("/api/files", () => {
  const file = (key: string, init: RequestInit = {}) => req(`/api/files?key=${encodeURIComponent(key)}`, init);
  it("stores, lists, returns and deletes files", async () => {
    const put = await files.PUT(
      file("tab-1:take:000000000000042", { method: "PUT", body: new Uint8Array([1, 2, 3]), headers: { "content-type": "audio/webm", "x-meta": encodeURIComponent(JSON.stringify({ at: 42, bpm: 90 })) } }),
    );
    expect(put.status).toBe(200);
    await files.PUT(file("tab-1", { method: "PUT", body: new Uint8Array([9]) }));
    await files.PUT(file("tab-2", { method: "PUT", body: new Uint8Array([8]) }));

    const list = await (await files.GET(req("/api/files?prefix=tab-1:take:"))).json();
    expect(list.files).toMatchObject([{ key: "tab-1:take:000000000000042", mime: "audio/webm", meta: { at: 42, bpm: 90 }, size: 3 }]);

    const got = await files.GET(file("tab-1:take:000000000000042"));
    expect(got.headers.get("content-type")).toBe("audio/webm");
    expect(JSON.parse(decodeURIComponent(got.headers.get("x-meta")!))).toEqual({ at: 42, bpm: 90 });
    expect([...new Uint8Array(await got.arrayBuffer())]).toEqual([1, 2, 3]);

    await files.DELETE(file("tab-1", { method: "DELETE" }));
    expect((await files.GET(file("tab-1"))).status).toBe(404);
    expect((await files.GET(file("tab-2"))).status).toBe(200);
  });
  it("refuses keys that could leave the files folder, and strangers", async () => {
    expect((await files.GET(file("../guitar.db"))).status).toBe(400);
    expect((await files.GET(file(".."))).status).toBe(400);
    expect((await files.GET(req("/api/files?key=tab-1", { token: null }))).status).toBe(401);
  });
});

describe("/api/video", () => {
  it("has the audio server download an Instagram video and keeps it as the item's file", async () => {
    vi.stubEnv("AUDIO_KEY", "audio-key");
    const calls: [string, RequestInit][] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(new Uint8Array([0, 0, 0, 24]), { headers: { "Content-Type": "video/mp4" } });
    });
    const r = await media.video(req("/api/video?ig=DejleJDxYHu&save=song-1"));
    expect(r.status).toBe(200);
    expect(calls[0][0]).toBe("http://127.0.0.1:8787/video?ig=DejleJDxYHu");
    expect((calls[0][1].headers as Record<string, string>).Authorization).toBe("Bearer audio-key");
    const stored = await files.GET(req("/api/files?key=song-1:ig:DejleJDxYHu"));
    expect(stored.headers.get("content-type")).toBe("video/mp4");
    expect(stored.headers.get("x-updated")).toBe(r.headers.get("x-updated"));
    expect((await media.video(req("/api/video?ig=../x&save=song-1"))).status).toBe(400);
    expect((await media.video(req("/api/video?ig=DejleJDxYHu&save=song-1", { token: null }))).status).toBe(401);
  });
});

describe("reminders", () => {
  const at = (iso: string) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  };

  beforeEach(() => {
    kvSet("guitar:tg_owner", "42");
  });

  it("reminds once at 19:00 on a practice day without a session, with what's in progress", async () => {
    kvSet("guitar:state", JSON.stringify({ updatedAt: 1, data }));
    at("2026-10-12T11:30:00Z"); // Monday, 18:30 in Novosibirsk: too early
    expect((await remind.remindIfDue()).sent).toBe(false);
    at("2026-10-12T12:00:00Z"); // 19:00
    expect((await remind.remindIfDue()).sent).toBe(true);
    expect(String(sent.at(-1)!.payload.text)).toContain("• Гаммы");
    expect((await remind.remindIfDue()).sent).toBe(false); // already today
    expect(kvGet("guitar:reminded")).toBe("2026-10-12");
  });
  it("stays quiet on rest days and after a session", async () => {
    at("2026-10-13T12:00:00Z"); // Tuesday
    kvSet("guitar:state", JSON.stringify({ updatedAt: 1, data }));
    expect((await remind.remindIfDue()).sent).toBe(false);
    at("2026-10-12T12:00:00Z");
    kvSet("guitar:state", JSON.stringify({ updatedAt: 1, data: { ...data, sessions: [{ date: "2026-10-12" }] } }));
    expect((await remind.remindIfDue()).sent).toBe(false);
  });
  it("sends a test message on request, only to the owner", async () => {
    expect((await remind.POST(req("/api/remind?test=1", { method: "POST", token: null }))).status).toBe(401);
    const r = await (await remind.POST(req("/api/remind?test=1", { method: "POST" }))).json();
    expect(r.sent).toBe(true);
    expect(String(sent.at(-1)!.payload.text)).toMatch(/Бот подключён/);
  });
});
