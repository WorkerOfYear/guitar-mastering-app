import { STARTER_VERSION } from "@/data/library";
import type { DataState } from "./data";
import type { Item, SessionLog, TempoEntry } from "@/shared/types";

// Two devices (phone browser and the Telegram Mini App) edit the same data offline.
// Merging is a union: nothing played on either device is lost, and for edited items the newer copy wins.

const stamp = (i: Item) => i.updatedAt ?? i.createdAt ?? 0;
/** A starter item nobody has touched (any version of the starter library). */
export const isPristine = (i: Item) => !i.updatedAt || i.updatedAt === STARTER_VERSION;
/** Edited beats pristine whatever the clock says; otherwise the newer copy wins. */
const newer = (a: Item, b: Item) => (isPristine(a) !== isPristine(b) ? !isPristine(a) : stamp(a) >= stamp(b));
const logKey = (t: TempoEntry) => `${t.at}:${t.itemId}:${t.sectionId ?? ""}`;

export function mergeData(local: DataState, remote: DataState | null | undefined): DataState {
  if (!remote) return local;
  const deleted: Record<string, number> = { ...(remote.deleted ?? {}) };
  for (const [id, at] of Object.entries(local.deleted ?? {})) deleted[id] = Math.max(at, deleted[id] ?? 0);

  const items = new Map<string, Item>();
  for (const item of [...(remote.items ?? []), ...local.items]) {
    const prev = items.get(item.id);
    if (!prev || newer(item, prev)) items.set(item.id, item);
  }
  // Keep order stable: local order first, then items only the other device has.
  const order = [...new Set([...local.items.map((i) => i.id), ...(remote.items ?? []).map((i) => i.id)])];
  const mergedItems = order
    .map((id) => items.get(id)!)
    .filter((i) => !(deleted[i.id] !== undefined && deleted[i.id] >= stamp(i)));

  const log = new Map<string, TempoEntry>();
  for (const t of [...(remote.log ?? []), ...local.log]) log.set(logKey(t), t);

  const sessions = new Map<string, SessionLog>();
  for (const s of [...(remote.sessions ?? []), ...local.sessions]) {
    const prev = sessions.get(s.id);
    if (!prev || s.endedAt >= prev.endedAt) sessions.set(s.id, s);
  }

  const lastPlayed = { ...(remote.lastPlayed ?? {}) };
  for (const [k, d] of Object.entries(local.lastPlayed)) if (!lastPlayed[k] || d > lastPlayed[k]) lastPlayed[k] = d;

  const remoteNewer = (remote.practiceUpdatedAt ?? 0) > (local.practiceUpdatedAt ?? 0);
  const remoteTemplate = (remote.templateUpdatedAt ?? 0) > (local.templateUpdatedAt ?? 0);
  const template = remoteTemplate ? remote.template : local.template;
  return {
    items: mergedItems,
    log: [...log.values()].sort((a, b) => a.at - b.at),
    sessions: [...sessions.values()].sort((a, b) => a.startedAt - b.startedAt),
    lastPlayed,
    recentKeys: local.recentKeys.length ? local.recentKeys : (remote.recentKeys ?? []),
    practice: remoteNewer ? remote.practice : local.practice,
    practiceUpdatedAt: Math.max(local.practiceUpdatedAt ?? 0, remote.practiceUpdatedAt ?? 0) || undefined,
    deleted,
    ...(template ? { template, templateUpdatedAt: Math.max(local.templateUpdatedAt ?? 0, remote.templateUpdatedAt ?? 0) } : {}),
  };
}

/** Cheap structural equality for deciding whether a push is needed. */
export const sameData = (a: DataState, b: DataState) => JSON.stringify(a) === JSON.stringify(b);
