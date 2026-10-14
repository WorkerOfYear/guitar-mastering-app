// MuseScore downloads for the guitar app: GET /score?url=<musescore.com link>&type=pdf|midi|mp3 with
// "Authorization: Bearer <KEY>" returns the file made by dl-librescore. Only musescore.com score links
// and three formats are accepted, so the server can't be used to fetch arbitrary URLs. Personal use:
// one key, two downloads at a time.
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEY = process.env.KEY ?? "";
const PORT = Number(process.env.PORT ?? 8080);
const SCORE_URL = /^https:\/\/(?:(?:s|www)\.)?musescore\.com\/[^\s]+$/;
const TYPES = { pdf: "application/pdf", midi: "audio/midi", mp3: "audio/mpeg" };
const EXT = { pdf: "pdf", midi: "mid", mp3: "mp3" };
let free = 2;
const waiting = [];

const acquire = () =>
  new Promise((resolve) => {
    if (free > 0) {
      free--;
      return resolve(true);
    }
    const t = setTimeout(() => {
      waiting.splice(waiting.indexOf(go), 1);
      resolve(false);
    }, 60_000);
    const go = () => (clearTimeout(t), resolve(true));
    waiting.push(go);
  });
const release = () => (waiting.length ? waiting.shift()() : free++);

const run = (url, type, dir) =>
  new Promise((resolve) =>
    execFile("dl-librescore", ["-i", url, "-t", type, "-o", dir], { timeout: 180_000, maxBuffer: 1 << 20 }, (error, stdout, stderr) =>
      resolve({ error, out: `${stderr}\n${stdout}`.trim() }),
    ),
  );

const send = (res, code, body, headers = {}) => {
  res.writeHead(code, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization",
    "Access-Control-Expose-Headers": "X-Name",
    ...headers,
  });
  res.end(body);
};
const fail = (res, code, message) => send(res, code, JSON.stringify({ error: message }), { "Content-Type": "application/json; charset=utf-8" });

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (req.method === "OPTIONS") return send(res, 204, "", { "Access-Control-Allow-Methods": "GET", "Access-Control-Max-Age": "86400" });
  if (url.pathname === "/health") return send(res, 200, "ok", { "Content-Type": "text/plain" });
  if (url.pathname !== "/score") return fail(res, 404, "Нет такого адреса");
  if (!KEY || req.headers.authorization !== `Bearer ${KEY}`) return fail(res, 401, "Неверный ключ");
  const link = url.searchParams.get("url") ?? "";
  const type = url.searchParams.get("type") ?? "";
  if (!(type in TYPES)) return fail(res, 400, "Формат: pdf, midi или mp3");
  if (!SCORE_URL.test(link)) return fail(res, 400, "Нужна ссылка на ноты с musescore.com");
  if (!(await acquire())) return fail(res, 503, "Сервер занят, попробуй через минуту");
  const dir = await mkdtemp(join(tmpdir(), "score-"));
  try {
    let files = [];
    let last = "";
    for (let attempt = 0; attempt < 2 && !files.length; attempt++) {
      const r = await run(link, type, dir);
      files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(`.${EXT[type]}`));
      last = (r.out.split("\n").filter(Boolean).pop() ?? "").slice(0, 200);
    }
    if (!files.length) return fail(res, 502, `Не удалось скачать${last ? `: ${last}` : ""}`);
    const path = join(dir, files[0]);
    const { size } = await stat(path);
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "X-Name",
      "Content-Type": TYPES[type],
      "Content-Length": size,
      "X-Name": encodeURIComponent(files[0]),
    });
    await new Promise((done) => createReadStream(path).on("error", done).on("close", done).pipe(res));
  } catch {
    if (!res.headersSent) fail(res, 500, "Ошибка сервера");
  } finally {
    await rm(dir, { recursive: true, force: true });
    release();
  }
}).listen(PORT, () => console.log(`listening on :${PORT}`));

if (!KEY) {
  console.error("Задай KEY — без ключа сервер не запустится");
  process.exit(1);
}
