// Reminders: once a day (REMIND_HOUR in TIMEZONE, 19:00 by default) on practice days, if there was no session yet,
// the bot sends a reminder — main.ts checks every few minutes. POST /api/remind?test=1 (password or Mini App) sends a test message.
import { appButton, checkAuth, handle, HttpError, json, loadState, ownerId, reminderState, reminderText, telegram, today } from "./lib.js";
import { kvGet, kvSet } from "./store.js";

const KEY_SENT = "guitar:reminded"; // the day the reminder went out

const hourNow = () =>
  Number(new Intl.DateTimeFormat("en-GB", { timeZone: process.env.TIMEZONE || "Asia/Novosibirsk", hour: "2-digit", hourCycle: "h23" }).format(new Date()));

/** Sends today's reminder if it's time and it wasn't sent yet. Quiet when the bot isn't set up. */
export async function remindIfDue(): Promise<{ sent: boolean }> {
  if (!process.env.TELEGRAM_BOT_TOKEN || hourNow() < Number(process.env.REMIND_HOUR || 19) || kvGet(KEY_SENT) === today()) return { sent: false };
  const chat = await ownerId();
  if (!chat) return { sent: false };
  kvSet(KEY_SENT, today());
  const state = reminderState(await loadState());
  if (!state.isDay || state.done) return { sent: false };
  const site = new Request(process.env.SITE_URL || process.env.PUBLIC_URL || "http://localhost");
  await telegram("sendMessage", { chat_id: chat, text: reminderText(state.next, state.minutes), reply_markup: { inline_keyboard: [[appButton(site, "▶ Начать занятие")]] } });
  return { sent: true };
}

export const POST = handle(async (req) => {
  if (new URL(req.url).searchParams.get("test") !== "1") throw new HttpError(400, "Только ?test=1");
  await checkAuth(req);
  const chat = await ownerId();
  if (!chat) throw new HttpError(409, "Бот ещё не подключён: нажми «Подключить бота» в настройках");
  const state = reminderState(await loadState());
  const text = `✅ Бот подключён. Так будет выглядеть напоминание:\n\n${reminderText(state.next, state.minutes)}`;
  await telegram("sendMessage", { chat_id: chat, text, reply_markup: { inline_keyboard: [[appButton(req, "▶ Начать занятие")]] } });
  return json({ sent: true, ...state });
});
