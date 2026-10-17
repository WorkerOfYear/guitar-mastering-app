// GET /api/state  → { doc: {updatedAt, data} | null }
// PUT /api/state  body {updatedAt, base, data} → stores it if the stored version is still `base` (else 409)
import { checkAuth, handle, HttpError, json, loadState, saveState, type StateDoc } from "./lib.js";

const MAX_BYTES = 20_000_000; // files live apart (files.ts), so the library itself stays far below this

export const GET = handle(async (req) => {
  await checkAuth(req);
  return json({ doc: await loadState() });
});

export const PUT = handle(async (req) => {
  await checkAuth(req);
  const raw = await req.text();
  if (raw.length > MAX_BYTES) throw new HttpError(413, "Слишком много данных для синхронизации");
  const doc = JSON.parse(raw || "{}") as Partial<StateDoc> & { base?: number | null };
  if (typeof doc.updatedAt !== "number" || !doc.data || !Array.isArray(doc.data.items)) throw new HttpError(400, "Неверный формат");
  // Optimistic lock: the client says which version it merged with; if another device wrote since, it must re-merge.
  const current = await loadState();
  if ((current?.updatedAt ?? null) !== (doc.base ?? null)) throw new HttpError(409, "Данные изменились на другом устройстве");
  await saveState({ updatedAt: doc.updatedAt, data: doc.data });
  return json({ ok: true, updatedAt: doc.updatedAt });
});
