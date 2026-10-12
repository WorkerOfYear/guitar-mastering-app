// The test stand's stand-in for Vercel Functions: serves the functions that need no Vercel storage or bot
// (for now only /api/tabs) from the same code in api/. Caddy sends /api/tabs here; sync and the bot stay on Vercel.
// Built into one file by `npm run build:stand-api` (dist-api/api.js), run with plain `node api.js`.
import http from "node:http";
import * as tabs from "../../api/tabs";

type Handler = (req: Request) => Promise<Response>;
const ROUTES: Record<string, Partial<Record<string, Handler>>> = { "/api/tabs": { GET: tabs.GET } };
const PORT = Number(process.env.PORT || 8789);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const fn = ROUTES[url.pathname]?.[req.method ?? "GET"];
    try {
      const r = fn ? await fn(new Request(url, { method: req.method })) : Response.json({ error: "Нет на тестовом стенде" }, { status: 404 });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: (e as Error).message }));
    }
  })
  .listen(PORT, () => console.log(`stand api on :${PORT}`));
