// The test stand is reachable through a Cloudflare quick tunnel, whose *.trycloudflare.com address changes every time the
// tunnel restarts. With TUNNEL_METRICS set (cloudflared's metrics server, http://tunnel:2000 in server/dev-stand) main.ts
// asks it for the current address every minute, remembers it as the site's address (siteUrl, reminders) and points the
// bot's webhook and menu button there — so the app always opens from the bot, whatever the address is today.
import { KEY_URL } from "./lib.js";
import { kvGet, kvSet } from "./store.js";
import { pointBot } from "./telegram.js";

const KEY_BOT_URL = "guitar:tg_url"; // the address the bot was last pointed at

/** Picks up a new tunnel address. Quiet when there's no tunnel to follow or it isn't up yet. */
export async function followTunnel(): Promise<string | null> {
  const metrics = process.env.TUNNEL_METRICS?.replace(/\/$/, "");
  if (!metrics) return null;
  const r = await fetch(`${metrics}/quicktunnel`).catch(() => null);
  const hostname = r?.ok ? ((await r.json().catch(() => ({}))) as { hostname?: string }).hostname : undefined;
  if (!hostname) return null;
  const url = `https://${hostname}`;
  if (kvGet(KEY_URL) !== url) {
    kvSet(KEY_URL, url);
    console.log(`tunnel: ${url}`);
  }
  if (process.env.TELEGRAM_BOT_TOKEN && kvGet(KEY_BOT_URL) !== url) {
    await pointBot(url, url);
    kvSet(KEY_BOT_URL, url);
    console.log("tunnel: the bot now opens", url);
  }
  return url;
}
