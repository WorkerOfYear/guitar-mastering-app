// Files of library items — Guitar Pro files, recordings, takes — live on the owner's server (/api/files), so every
// device has them. IndexedDB keeps a copy of each file this device has seen: it opens instantly and works offline.
// A file saved offline waits in `pending` and goes up with the next sync (flushFiles); files from before the server
// (only in IndexedDB) go up the same way. Keyed by library item id.

import { apiFetch, failure } from "./api";

const DB = "guitar-files";
const STORE = "tabs";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Takes: the user's own playing, recorded in a session or on the card, to listen to later.
// Stored as `<itemId>:take:<time>`, so one item's takes sit together and come out oldest first.
export interface Take {
  at: number;
  /** Tempo the metronome was at when recording, if it was used */
  bpm?: number | null;
  mime: string;
  data: ArrayBuffer;
}
type Stored = ArrayBuffer | Take;

const cached = (key: string) => run<Stored | undefined>("readonly", (s) => s.get(key));
const cache = (key: string, value: Stored) => run("readwrite", (s) => s.put(value, key));
const uncache = (key: string) => run("readwrite", (s) => s.delete(key));

// ---------- what the server has: the version of each cached copy, and changes still to send

interface FileState {
  /** key → updatedAt of the server copy this device has cached */
  ver: Record<string, number>;
  /** Changes made offline, sent with the next sync */
  pending: Record<string, "put" | "delete">;
}
const STATE_KEY = "guitar:files";

function readState(): FileState {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as FileState | null;
    return { ver: s?.ver ?? {}, pending: s?.pending ?? {} };
  } catch {
    return { ver: {}, pending: {} };
  }
}
function updateState(fn: (s: FileState) => void) {
  const s = readState();
  fn(s);
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(s));
  } catch {
    /* private mode: files still work, just re-download */
  }
}
const setVer = (key: string, v: number | undefined) =>
  updateState((s) => {
    if (v === undefined) delete s.ver[key];
    else s.ver[key] = v;
  });
const setPending = (key: string, op: "put" | "delete" | undefined) =>
  updateState((s) => {
    if (op === undefined) delete s.pending[key];
    else s.pending[key] = op;
  });

const online = () => /^https?:$/.test(location.protocol) && navigator.onLine !== false;

interface RemoteFile {
  key: string;
  mime: string;
  meta: { at?: number; bpm?: number | null } | null;
  updatedAt: number;
}

const fileUrl = (key: string) => `/api/files?key=${encodeURIComponent(key)}`;

async function listRemote(prefix: string): Promise<RemoteFile[]> {
  const r = await apiFetch(`/api/files?prefix=${encodeURIComponent(prefix)}`);
  if (!r.ok) throw Object.assign(new Error(await failure(r)), { status: r.status });
  return ((await r.json()) as { files: RemoteFile[] }).files;
}

async function download(key: string): Promise<Stored | undefined> {
  const r = await apiFetch(fileUrl(key));
  if (r.status === 404) return undefined;
  if (!r.ok) throw new Error(await failure(r));
  const data = await r.arrayBuffer();
  const meta = JSON.parse(decodeURIComponent(r.headers.get("X-Meta") ?? "null")) as RemoteFile["meta"];
  const value: Stored = key.includes(":take:")
    ? { at: Number(meta?.at ?? key.split(":take:")[1]), bpm: meta?.bpm ?? null, mime: r.headers.get("Content-Type") ?? "audio/webm", data }
    : data;
  await cache(key, value);
  setVer(key, Number(r.headers.get("X-Updated")) || Date.now());
  return value;
}

async function upload(key: string) {
  const value = await cached(key);
  if (value === undefined) return;
  const take = value instanceof ArrayBuffer ? null : value;
  const r = await apiFetch(fileUrl(key), {
    method: "PUT",
    body: take ? take.data : (value as ArrayBuffer),
    headers: {
      "Content-Type": take?.mime ?? "application/octet-stream",
      "X-Meta": encodeURIComponent(JSON.stringify(take ? { at: take.at, bpm: take.bpm ?? null } : null)),
    },
  });
  if (!r.ok) throw Object.assign(new Error(await failure(r)), { status: r.status });
  setVer(key, ((await r.json()) as { file: { updatedAt: number } }).file.updatedAt);
}

async function remoteDelete(key: string) {
  const r = await apiFetch(fileUrl(key), { method: "DELETE" });
  if (!r.ok && r.status !== 404) throw Object.assign(new Error(await failure(r)), { status: r.status });
}

async function put(key: string, value: Stored) {
  await cache(key, value);
  setPending(key, "put");
  if (!online()) return;
  try {
    await upload(key);
    setPending(key, undefined);
  } catch {
    /* stays pending */
  }
}

async function remove(key: string) {
  await uncache(key);
  setVer(key, undefined);
  setPending(key, "delete");
  if (!online()) return;
  try {
    await remoteDelete(key);
    setPending(key, undefined);
  } catch {
    /* stays pending */
  }
}

/** The cached copy if it's the server's latest, else the server's (cached for next time). Offline: the cached copy. */
async function load(key: string): Promise<ArrayBuffer | undefined> {
  const local = (await cached(key)) as ArrayBuffer | undefined;
  const { ver, pending } = readState();
  if (pending[key]) return pending[key] === "delete" ? undefined : local;
  if (!online()) return local;
  let remote: RemoteFile | undefined;
  try {
    remote = (await listRemote(key)).find((f) => f.key === key);
  } catch {
    return local;
  }
  if (!remote) {
    // Synced before and gone now: deleted on another device. Never synced: a file from before the server, keep it.
    if (local !== undefined && ver[key] !== undefined) {
      await uncache(key);
      setVer(key, undefined);
      return undefined;
    }
    return local;
  }
  if (local !== undefined && ver[key] === remote.updatedAt) return local;
  try {
    return (await download(key)) as ArrayBuffer | undefined;
  } catch {
    return local;
  }
}

/** Sends what was saved or deleted offline, and files that were only ever on this device. */
export async function flushFiles() {
  if (!online()) return;
  const keys = (await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys())).map(String);
  const { ver, pending } = readState();
  for (const k of keys) if (ver[k] === undefined && !pending[k]) setPending(k, "put");
  for (const [key, op] of Object.entries(readState().pending)) {
    try {
      if (op === "put") await upload(key);
      else await remoteDelete(key);
      setPending(key, undefined);
    } catch (e) {
      if ((e as { status?: number }).status === 0) return; // offline: try again next time
    }
  }
}

export const saveTabFile = (itemId: string, data: ArrayBuffer) => put(itemId, data);
export const loadTabFile = (itemId: string) => load(itemId);
export const deleteTabFile = (itemId: string) => remove(itemId);

// The recording behind a tab, stored next to it.
const audioKey = (itemId: string) => `${itemId}:audio`;
export const saveAudioFile = (itemId: string, data: ArrayBuffer) => put(audioKey(itemId), data);
/** A recording the server already stored (taken from a video with save=): only cache it here. */
export async function cacheAudioFile(itemId: string, data: ArrayBuffer, updatedAt: number) {
  await cache(audioKey(itemId), data);
  setVer(audioKey(itemId), updatedAt);
  setPending(audioKey(itemId), undefined);
}
export const loadAudioFile = (itemId: string) => load(audioKey(itemId));
export const deleteAudioFile = (itemId: string) => remove(audioKey(itemId));

const takePrefix = (itemId: string) => `${itemId}:take:`;
const takeKey = (itemId: string, at: number) => `${takePrefix(itemId)}${String(at).padStart(15, "0")}`;
const takeRange = (itemId: string) => IDBKeyRange.bound(takePrefix(itemId), `${takePrefix(itemId)}￿`);
export const saveTake = (itemId: string, take: Take) => put(takeKey(itemId, take.at), take);
export const deleteTake = (itemId: string, at: number) => remove(takeKey(itemId, at));

/** This item's takes, oldest first: the server's, plus any recorded offline and not sent yet. */
export async function loadTakes(itemId: string): Promise<Take[]> {
  const localKeys = (await run<IDBValidKey[]>("readonly", (s) => s.getAllKeys(takeRange(itemId)))).map(String);
  const { ver, pending } = readState();
  let remote: RemoteFile[] | null = null;
  if (online())
    try {
      remote = await listRemote(takePrefix(itemId));
    } catch {
      remote = null;
    }
  if (remote) {
    const remoteKeys = new Set(remote.map((f) => f.key));
    for (const f of remote) if (pending[f.key] !== "delete" && (ver[f.key] !== f.updatedAt || !localKeys.includes(f.key))) await download(f.key).catch(() => undefined);
    // Deleted on another device: synced before, gone from the server now.
    for (const k of localKeys)
      if (!remoteKeys.has(k) && ver[k] !== undefined && !pending[k]) {
        await uncache(k);
        setVer(k, undefined);
      }
  }
  const takes = await run<Take[]>("readonly", (s) => s.getAll(takeRange(itemId)));
  return takes.sort((a, b) => a.at - b.at);
}

// An Instagram video, downloaded by the server as mp4 and played in the app's own player (Instagram's embed shows the
// account, likes and comments, and often doesn't play on iPhones). Keyed by the post too, so a replaced link isn't mixed up.
const instagramKey = (itemId: string, code: string) => `${itemId}:ig:${code}`;
const fetching = new Map<string, Promise<ArrayBuffer>>();

/** The video from this device or the server; the first time, the server downloads it from Instagram. */
export async function loadInstagramVideo(itemId: string, code: string): Promise<ArrayBuffer> {
  const key = instagramKey(itemId, code);
  const have = await load(key);
  if (have) return have;
  let job = fetching.get(key);
  if (!job) {
    job = (async () => {
      const r = await apiFetch(`/api/video?ig=${encodeURIComponent(code)}&save=${encodeURIComponent(itemId)}`);
      if (!r.ok) throw new Error(await failure(r));
      const data = await r.arrayBuffer();
      await cache(key, data);
      setVer(key, Number(r.headers.get("X-Updated")) || Date.now());
      return data;
    })().finally(() => fetching.delete(key));
    fetching.set(key, job);
  }
  return job;
}

export const deleteInstagramVideo = (itemId: string, code: string) => remove(instagramKey(itemId, code));
