import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVideoAudio } from "./youtubeAudio";
import { useAuth } from "@/store/auth";

useAuth.setState({ token: "t" });
const ok = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mp4", "X-Title": encodeURIComponent("Песня") } });
const fail = (status: number) => new Response(JSON.stringify({ error: `код ${status}` }), { status });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function run(responses: (Response | Error)[]) {
  vi.useFakeTimers();
  const fetch = vi.fn(async () => {
    const r = responses.shift()!;
    if (r instanceof Error) throw r;
    return r;
  });
  vi.stubGlobal("fetch", fetch);
  const attempts: number[] = [];
  const result = fetchVideoAudio({ youtubeId: "2n6qPXwKfvc" }, undefined, (a) => attempts.push(a)).then(
    (v) => ({ v }),
    (e: Error) => ({ e: e.message }),
  );
  await vi.runAllTimersAsync();
  return { out: await result, calls: fetch.mock.calls.length, attempts };
}

describe("fetchVideoAudio", () => {
  it("retries a dropped connection and a 5xx, then succeeds", async () => {
    const { out, calls, attempts } = await run([new TypeError("network"), fail(502), ok()]);
    expect(calls).toBe(3);
    expect(attempts).toEqual([1, 2, 3]);
    expect(out).toMatchObject({ v: { name: "Песня.m4a" } });
  });
  it("gives up after three failures with the server's message", async () => {
    const { out, calls } = await run([fail(503), fail(503), fail(502)]);
    expect(calls).toBe(3);
    expect(out).toEqual({ e: "код 502" });
  });
  it("doesn't retry a refused request", async () => {
    const { out, calls } = await run([fail(403)]);
    expect(calls).toBe(1);
    expect(out).toEqual({ e: "код 403" });
  });
  it("asks for an Instagram video by its shortcode", async () => {
    const fetch = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetch);
    await fetchVideoAudio({ instagramId: "C9xYz_12AbC" }, "song-1");
    expect(fetch).toHaveBeenCalledWith("/api/audio?ig=C9xYz_12AbC&save=song-1", { headers: { Authorization: "Bearer t" } });
  });
});
