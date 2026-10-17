// Storage on the owner's server: SQLite (keys and values, file list) in DATA_DIR/guitar.db, file contents in DATA_DIR/files.
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

let db: DatabaseSync | null = null;
let dir = "";

function open() {
  if (db) return db;
  dir = path.resolve(process.env.DATA_DIR || "data");
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  db = new DatabaseSync(path.join(dir, "guitar.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER);
    CREATE TABLE IF NOT EXISTS files (key TEXT PRIMARY KEY, mime TEXT NOT NULL, meta TEXT, size INTEGER NOT NULL, updated_at INTEGER NOT NULL);
  `);
  return db;
}

/** Closes the database, so the next call opens DATA_DIR again (tests switch it). */
export function closeStore() {
  db?.close();
  db = null;
}

// ---------- keys and values

export function kvGet(key: string): string | null {
  const row = open().prepare("SELECT value, expires FROM kv WHERE key = ?").get(key) as { value: string; expires: number | null } | undefined;
  if (!row) return null;
  if (row.expires && row.expires < Date.now()) {
    kvDel(key);
    return null;
  }
  return row.value;
}

export function kvSet(key: string, value: string, ttlSec?: number) {
  open()
    .prepare("INSERT INTO kv (key, value, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires = excluded.expires")
    .run(key, value, ttlSec ? Date.now() + ttlSec * 1000 : null);
}

export function kvDel(key: string) {
  open().prepare("DELETE FROM kv WHERE key = ?").run(key);
}

// ---------- files: tabs, recordings, takes. Keys come from the app: "<item id>", "<item id>:audio", "<item id>:take:<time>".

export const FILE_KEY = /^[A-Za-z0-9][\w:.-]{0,199}$/;

export interface FileInfo {
  key: string;
  mime: string;
  meta: Record<string, unknown> | null;
  size: number;
  updatedAt: number;
}

interface FileRow {
  key: string;
  mime: string;
  meta: string | null;
  size: number;
  updated_at: number;
}

const info = (r: FileRow): FileInfo => ({ key: r.key, mime: r.mime, meta: r.meta ? (JSON.parse(r.meta) as Record<string, unknown>) : null, size: r.size, updatedAt: r.updated_at });

const filePath = (key: string) => {
  if (!FILE_KEY.test(key)) throw new Error(`bad file key: ${key}`);
  return path.join(dir, "files", key);
};

export function fileInfo(key: string): FileInfo | null {
  const row = open().prepare("SELECT * FROM files WHERE key = ?").get(key) as FileRow | undefined;
  return row ? info(row) : null;
}

/** Files whose keys start with `prefix`, in key order. */
export function listFiles(prefix: string): FileInfo[] {
  const rows = open()
    .prepare("SELECT * FROM files WHERE substr(key, 1, ?) = ? ORDER BY key")
    .all(prefix.length, prefix) as unknown as FileRow[];
  return rows.map(info);
}

export function readFile(key: string): Buffer | null {
  if (!fileInfo(key)) return null;
  try {
    return fs.readFileSync(filePath(key));
  } catch {
    return null;
  }
}

export function saveFile(key: string, data: Uint8Array, mime: string, meta: Record<string, unknown> | null = null): FileInfo {
  open();
  const target = filePath(key);
  // Write next to it, then rename: a crash never leaves half a file under the real name.
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, target);
  const updatedAt = Date.now();
  open()
    .prepare(
      `INSERT INTO files (key, mime, meta, size, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET mime = excluded.mime, meta = excluded.meta, size = excluded.size, updated_at = excluded.updated_at`,
    )
    .run(key, mime, meta ? JSON.stringify(meta) : null, data.byteLength, updatedAt);
  return { key, mime, meta, size: data.byteLength, updatedAt };
}

export function deleteFile(key: string) {
  open().prepare("DELETE FROM files WHERE key = ?").run(key);
  fs.rmSync(filePath(key), { force: true });
}
