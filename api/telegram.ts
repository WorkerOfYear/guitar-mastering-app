// Telegram bot:
//   POST /api/telegram            — webhook: Telegram sends updates here (checked by secret header)
//   POST /api/telegram?setup=1    — (sync key) register webhook + menu button, return a one-time link to bind the bot
//   GET  /api/telegram?status=1   — (sync key or Mini App) bot name and whether it's bound to the owner
import crypto from "node:crypto";
import {
  KEY_LINK, appButton, checkAuth, checkSyncKey, handle, HttpError, json, loadState, ownerId, redis,
  practiceDaysText, reminderState, safeEqual, setOwner, siteUrl, telegram, webhookSecret,
} from "./_lib.js";

async function setup(req: Request) {
  checkSyncKey(req);
  const me = await telegram<{ username: string }>("getMe");
  await telegram("setWebhook", { url: `${siteUrl(req)}/api/telegram`, secret_token: webhookSecret(), allowed_updates: ["message"] });
  await telegram("setChatMenuButton", { menu_button: { type: "web_app", text: "Гитара", web_app: { url: `${siteUrl(req)}/` } } });
  await telegram("setMyCommands", { commands: [{ command: "start", description: "Открыть приложение" }] });
  const code = crypto.randomBytes(12).toString("hex");
  await redis("SET", KEY_LINK, code, "EX", 3600);
  return json({ bot: me.username, link: `https://t.me/${me.username}?start=${code}`, linked: !!(await ownerId()) });
}

async function status(req: Request) {
  await checkAuth(req);
  const me = await telegram<{ username: string }>("getMe");
  return json({ bot: me.username, linked: !!(await ownerId()) });
}

interface Update {
  message?: { chat?: { id: number; type: string }; text?: string };
}

async function webhook(req: Request) {
  const got = req.headers.get("x-telegram-bot-api-secret-token");
  if (!got || !safeEqual(got, webhookSecret())) throw new HttpError(401, "bad secret");
  const update = (await req.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (!msg?.chat || msg.chat.type !== "private") return json({ ok: true });

  const chat = String(msg.chat.id);
  const text = (msg.text || "").trim();
  const reply = (t: string, withButton = true) =>
    telegram("sendMessage", { chat_id: chat, text: t, reply_markup: withButton ? { inline_keyboard: [[appButton(req, "🎸 Открыть")]] } : undefined });

  const code = text.match(/^\/start(?:\s+(\S+))?/)?.[1];
  if (code) {
    const expected = (await redis("GET", KEY_LINK)) as string | null;
    if (expected && safeEqual(code, expected)) {
      await setOwner(chat);
      await redis("DEL", KEY_LINK);
      const days = practiceDaysText(await loadState());
      await reply(`✅ Готово! Это твой бот: в дни занятий (${days}) напомню позаниматься.\n\nПриложение открывается кнопкой «Гитара» внизу.`);
      return json({ ok: true });
    }
  }

  const owner = await ownerId();
  if (owner && chat === String(owner)) {
    const s = reminderState(await loadState());
    await reply(s.done ? "🎸 Сегодня ты уже позанимался. Отлично!" : s.isDay ? "🎸 Сегодня день занятия." : "Сегодня отдых по расписанию — но позаниматься можно всегда 🙂");
  } else {
    await reply("Это личный бот для занятий на гитаре 🙂", false);
  }
  return json({ ok: true });
}

export const GET = handle(async (req) => {
  if (new URL(req.url).searchParams.get("status") === "1") return status(req);
  throw new HttpError(405, "Method not allowed");
});

export const POST = handle(async (req) => {
  const q = new URL(req.url).searchParams;
  if (q.get("setup") === "1") return setup(req);
  if (q.get("status") === "1") return status(req);
  return webhook(req);
});
