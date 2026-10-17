// POST /api/login  body {password} → {token}: the device keeps the token and sends it as "Authorization: Bearer …".
// GET  /api/me     (password or Mini App) → what this server can do: take audio from videos, scores from MuseScore, the bot.
import { checkAuth, checkPassword, handle, HttpError, issueToken, json } from "./lib.js";

// Guessing the password: after 5 misses from one address, each next try waits a minute.
const misses = new Map<string, { count: number; until: number }>();
const clientAddress = (req: Request) => req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";

export const login = handle(async (req) => {
  const who = clientAddress(req);
  const m = misses.get(who);
  if (m && m.until > Date.now()) throw new HttpError(429, "Слишком много попыток — подожди минуту");
  const { password } = (await req.json().catch(() => ({}))) as { password?: unknown };
  if (!process.env.APP_PASSWORD) throw new HttpError(500, "На сервере не задан APP_PASSWORD");
  if (typeof password !== "string" || !checkPassword(password)) {
    const count = (m?.count ?? 0) + 1;
    misses.set(who, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
    throw new HttpError(401, "Неверный пароль");
  }
  misses.delete(who);
  return json({ token: issueToken() });
});

export const me = handle(async (req) => {
  await checkAuth(req);
  return json({ audio: !!process.env.AUDIO_KEY, score: !!process.env.SCORE_KEY, bot: !!process.env.TELEGRAM_BOT_TOKEN });
});
