// The library's files — tabs, recordings, takes — so every device has them (password or Mini App):
//   GET    /api/files?prefix=<p>   → { files: [{key, mime, meta, size, updatedAt}] }
//   GET    /api/files?key=<k>      → the file (X-Meta: its meta as URI-encoded JSON, X-Updated: updatedAt)
//   PUT    /api/files?key=<k>      body: the file; Content-Type, X-Meta → { file }
//   DELETE /api/files?key=<k>
import { checkAuth, handle, HttpError, json } from "./lib.js";
import { deleteFile, fileInfo, FILE_KEY, listFiles, readFile, saveFile } from "./store.js";

export const MAX_FILE = 64 * 1024 * 1024;

function keyOf(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!FILE_KEY.test(key)) throw new HttpError(400, "Неверное имя файла");
  return key;
}

export const GET = handle(async (req) => {
  await checkAuth(req);
  const prefix = new URL(req.url).searchParams.get("prefix");
  if (prefix !== null) return json({ files: listFiles(prefix) });
  const key = keyOf(req);
  const info = fileInfo(key);
  const data = info && readFile(key);
  if (!info || !data) throw new HttpError(404, "Файла нет на сервере");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": info.mime,
      "Cache-Control": "no-store",
      "X-Meta": encodeURIComponent(JSON.stringify(info.meta)),
      "X-Updated": String(info.updatedAt),
    },
  });
});

export const PUT = handle(async (req) => {
  await checkAuth(req);
  const key = keyOf(req);
  const data = new Uint8Array(await req.arrayBuffer());
  if (data.byteLength > MAX_FILE) throw new HttpError(413, "Файл больше 64 МБ");
  let meta: Record<string, unknown> | null = null;
  try {
    meta = JSON.parse(decodeURIComponent(req.headers.get("x-meta") || "null")) as Record<string, unknown> | null;
  } catch {
    throw new HttpError(400, "Неверный X-Meta");
  }
  return json({ file: saveFile(key, data, req.headers.get("content-type") || "application/octet-stream", meta) });
});

export const DELETE = handle(async (req) => {
  await checkAuth(req);
  deleteFile(keyOf(req));
  return json({ ok: true });
});
