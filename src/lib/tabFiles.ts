// Guitar Pro files live in IndexedDB on this device (they are binary and can be a few hundred KB,
// too big for the synced JSON). Keyed by library item id.

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

export const saveTabFile = (itemId: string, data: ArrayBuffer) => run("readwrite", (s) => s.put(data, itemId));
export const loadTabFile = (itemId: string) => run<ArrayBuffer | undefined>("readonly", (s) => s.get(itemId));
export const deleteTabFile = (itemId: string) => run("readwrite", (s) => s.delete(itemId));

// The recording behind a tab, stored next to it.
const audioKey = (itemId: string) => `${itemId}:audio`;
export const saveAudioFile = (itemId: string, data: ArrayBuffer) => run("readwrite", (s) => s.put(data, audioKey(itemId)));
export const loadAudioFile = (itemId: string) => run<ArrayBuffer | undefined>("readonly", (s) => s.get(audioKey(itemId)));
export const deleteAudioFile = (itemId: string) => run("readwrite", (s) => s.delete(audioKey(itemId)));

// Takes: the user's own playing, recorded in a session or on the card, to listen to later.
// Stored as `<itemId>:take:<time>`, so one item's takes sit together and come out oldest first.
export interface Take {
  at: number;
  /** Tempo the metronome was at when recording, if it was used */
  bpm?: number | null;
  mime: string;
  data: ArrayBuffer;
}
const takePrefix = (itemId: string) => `${itemId}:take:`;
const takeKey = (itemId: string, at: number) => `${takePrefix(itemId)}${String(at).padStart(15, "0")}`;
const takeRange = (itemId: string) => IDBKeyRange.bound(takePrefix(itemId), `${takePrefix(itemId)}￿`);
export const saveTake = (itemId: string, take: Take) => run("readwrite", (s) => s.put(take, takeKey(itemId, take.at)));
export const loadTakes = (itemId: string) => run<Take[]>("readonly", (s) => s.getAll(takeRange(itemId)));
export const deleteTake = (itemId: string, at: number) => run("readwrite", (s) => s.delete(takeKey(itemId, at)));
