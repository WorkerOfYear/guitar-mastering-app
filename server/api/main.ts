// The app's API on the owner's server: the library (sync), its files, the helper servers, tab search and the Telegram bot.
// Built into one file by `npm run build:api` (dist-api/api.js), run with plain `node api.js` — server/production and server/dev-stand run it.
// Env: PORT (8789), HOST (127.0.0.1), DATA_DIR, APP_PASSWORD, AUDIO_KEY, SCORE_KEY, TELEGRAM_BOT_TOKEN, SITE_URL, PUBLIC_URL…
import http from "node:http";
import * as files from "./files";
import * as remind from "./remind";
import * as media from "./media";
import * as session from "./session";
import * as state from "./state";
import * as tabs from "./tabs";
import * as bot from "./telegram";

type Handler = (req: Request) => Promise<Response>;
const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/api/health": { GET: async () => new Response("ok") },
  "/api/login": { POST: session.login },
  "/api/me": { GET: session.me },
  "/api/state": { GET: state.GET, PUT: state.PUT },
  "/api/files": { GET: files.GET, PUT: files.PUT, DELETE: files.DELETE },
  "/api/audio": { GET: media.audio },
  "/api/video": { GET: media.video },
  "/api/score": { GET: media.score },
  "/api/tabs": { GET: tabs.GET },
  "/api/telegram": { GET: bot.GET, POST: bot.POST },
  "/api/remind": { POST: remind.POST },
};
const PORT = Number(process.env.PORT || 8789);
const HOST = process.env.HOST || "127.0.0.1";
const MAX_BODY = files.MAX_FILE + 1024 * 1024;

// The app on Vercel calls this server from another origin; auth goes in headers, not cookies, so any origin is fine.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Meta, X-Telegram-Init-Data",
  "Access-Control-Expose-Headers": "X-Meta, X-Updated, X-Title, X-Name",
  "Access-Control-Max-Age": "86400",
};

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("too big"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

http
  .createServer(async (req, res) => {
    const proto = String(req.headers["x-forwarded-proto"] ?? "http").split(",")[0];
    const url = new URL(req.url ?? "/", `${proto}://${req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost"}`);
    const method = req.method ?? "GET";
    if (method === "OPTIONS") {
      res.writeHead(204, CORS);
      return res.end();
    }
    const fn = ROUTES[url.pathname]?.[method];
    try {
      let r: Response;
      if (!fn) r = Response.json({ error: "Нет такого адреса" }, { status: 404 });
      else {
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
        const body = method === "GET" || method === "HEAD" ? undefined : new Uint8Array(await readBody(req));
        r = await fn(new Request(url, { method, headers, body }));
      }
      res.writeHead(r.status, { ...Object.fromEntries(r.headers), ...CORS });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      const big = (e as Error).message === "too big";
      res.writeHead(big ? 413 : 500, { "Content-Type": "application/json; charset=utf-8", ...CORS });
      res.end(JSON.stringify({ error: big ? "Файл слишком большой" : (e as Error).message }));
    }
  })
  .listen(PORT, HOST, () => console.log(`guitar api on ${HOST}:${PORT}`));

// Daily reminder from the bot.
const tick = () => remind.remindIfDue().catch((e: Error) => console.error("reminder:", e.message));
setInterval(tick, 5 * 60_000);
void tick();
