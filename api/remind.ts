// Daily Vercel Cron (see vercel.json): on practice days, if there was no session yet, the bot sends a reminder.
// POST /api/remind?test=1 (sync key or Mini App) sends a test message right away.
import { appButton, checkAuth, handle, HttpError, json, loadState, ownerId, reminderState, reminderText, telegram } from "./_lib.js";

function fromCron(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) return req.headers.get("authorization") === `Bearer ${secret}`;
  return /vercel-cron/i.test(req.headers.get("user-agent") || "");
}

async function run(req: Request) {
  const test = new URL(req.url).searchParams.get("test") === "1";
  if (test) await checkAuth(req);
  else if (!fromCron(req)) throw new HttpError(401, "Только для Vercel Cron");

  const chat = await ownerId();
  if (!chat) throw new HttpError(409, "Бот ещё не подключён: нажми «Подключить бота» в настройках");
  const state = reminderState(await loadState());
  if (!test && (!state.isDay || state.done)) return json({ sent: false, ...state });

  const text = test ? `✅ Бот подключён. Так будет выглядеть напоминание:\n\n${reminderText(state.next, state.minutes)}` : reminderText(state.next, state.minutes);
  await telegram("sendMessage", { chat_id: chat, text, reply_markup: { inline_keyboard: [[appButton(req, "▶ Начать занятие")]] } });
  return json({ sent: true, ...state });
}

export const GET = handle(run);
export const POST = handle(run);
