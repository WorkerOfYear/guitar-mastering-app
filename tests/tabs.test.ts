import { afterEach, describe, expect, it, vi } from "vitest";
import * as tabs from "../api/tabs";
import { songQuery } from "../src/lib/titles";

const songsterr = [
  {
    songId: 61253,
    artist: "Paul Gilbert",
    title: "Fuzz Universe",
    hasPlayer: true,
    tracks: [
      { instrument: "Distortion Guitar", views: 158769, difficulty: 7 },
      { instrument: "Distortion Guitar", views: 900, difficulty: 3 },
      { instrument: "Electric Bass (finger)", views: 999999, difficulty: 2 },
    ],
  },
];

// The JSON UG embeds in its search page, HTML-escaped like the real one.
const ugPage = (results: unknown[]) =>
  `<html><div class="js-store" data-content="${JSON.stringify({ store: { page: { data: { results } } } })
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")}"></div></html>`;
const ugResults = [
  { song_name: "Fuzz Universe", artist_name: "Paul Gilbert", type: null, marketing_type: "TabPro", tab_url: "https://www.ultimate-guitar.com/pro/?x=1" },
  { song_name: "Fuzz Universe", artist_name: "Paul Gilbert", type: "Pro", rating: 4.80811, votes: 146, tab_access_type: "public", tab_url: "https://tabs.ultimate-guitar.com/tab/paul-gilbert/fuzz-universe-guitar-pro-967181" },
  { song_name: "Fuzz Universe", artist_name: "Paul Gilbert", type: "Pro", rating: 4.6, votes: 4, tab_access_type: "public", tab_url: "https://tabs.ultimate-guitar.com/tab/paul-gilbert/fuzz-universe-guitar-pro-1453253" },
  { song_name: "Fuzz Universe", artist_name: "Paul Gilbert", type: "Official", rating: 4.93946, votes: 106, tab_access_type: "public", tab_url: "https://tabs.ultimate-guitar.com/tab/paul-gilbert/fuzz-universe-official-2524695" },
  { song_name: "Fuzz Universe", artist_name: "Paul Gilbert", type: "Video", votes: 500, tab_access_type: "public", tab_url: "https://tabs.ultimate-guitar.com/v" },
];

// Brave's web results for "… site:musescore.com": scores, plus pages that aren't one.
const brave = {
  web: {
    results: [
      { title: "Fuzz Universe – Paul Gilbert Sheet music for Guitar (Solo) | Musescore.com", url: "https://musescore.com/user/3044216/scores/5193702" },
      { title: "Paul Gilbert sheet music | Play, print, and download in PDF or MIDI", url: "https://musescore.com/sheetmusic/artists/paul-gilbert" },
      { title: "Fuzz Universe &amp; <strong>more</strong> Sheet music for Guitar, Bass guitar (Mixed Duet) | Musescore.com", url: "https://musescore.com/fuzzfan/scores/1234/" },
      { title: "Fuzz Universe – Paul Gilbert Sheet music for Guitar (Solo) | Musescore.com", url: "http://musescore.com/user/3044216/scores/5193702" },
      { title: "Third", url: "https://musescore.com/user/1/scores/1" },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("tab search", () => {
  it("builds Songsterr links with the difficulty of the most viewed guitar part", () => {
    expect(tabs.parseSongsterr(songsterr)).toEqual([
      {
        source: "songsterr",
        artist: "Paul Gilbert",
        title: "Fuzz Universe",
        kind: "Таб + плеер",
        url: "https://www.songsterr.com/a/wsa/paul-gilbert-fuzz-universe-tab-s61253",
        difficulty: 7,
      },
    ]);
  });

  it("reads UG results from the page, drops ads and kinds a guitarist doesn't need, most voted first", () => {
    const r = tabs.parseUltimateGuitar(ugPage(ugResults));
    expect(r.map((t) => [t.kind, t.votes])).toEqual([
      ["Guitar Pro", 146],
      ["Official", 106],
      ["Guitar Pro", 4],
    ]);
    expect(r[0]).toMatchObject({ rating: 4.8, url: "https://tabs.ultimate-guitar.com/tab/paul-gilbert/fuzz-universe-guitar-pro-967181" });
    expect(() => tabs.parseUltimateGuitar("<html>Just a moment...</html>")).toThrow();
  });

  it("returns what it found and names the site that failed", async () => {
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("songsterr") ? new Response(JSON.stringify(songsterr)) : new Response("Just a moment...", { status: 403 }),
    );
    const res = await tabs.GET(new Request("https://guitar.test/api/tabs?q=Paul%20Gilbert%20Fuzz%20Universe"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.failed).toEqual(["ug"]);
    expect((await tabs.GET(new Request("https://guitar.test/api/tabs?q=a"))).status).toBe(400);
  });

  it("takes MuseScore scores from search results, without duplicates or pages that aren't a score", () => {
    expect(tabs.parseMuseScore(brave.web.results)).toEqual([
      {
        source: "musescore",
        artist: "Paul Gilbert",
        title: "Fuzz Universe",
        kind: "Ноты",
        url: "https://musescore.com/user/3044216/scores/5193702",
        parts: "Guitar (Solo)",
      },
      { source: "musescore", artist: "", title: "Fuzz Universe & more", kind: "Ноты", url: "https://musescore.com/fuzzfan/scores/1234", parts: "Guitar, Bass guitar (Mixed Duet)" },
    ]);
  });

  it("searches MuseScore through Brave only with a key, and puts its scores after Songsterr", async () => {
    const asked: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      asked.push(url);
      if (url.includes("songsterr")) return new Response(JSON.stringify(songsterr));
      if (url.includes("brave")) {
        expect((init?.headers as Record<string, string>)["X-Subscription-Token"]).toBe("k");
        expect(new URL(url).searchParams.get("q")).toBe("Paul Gilbert Fuzz Universe site:musescore.com");
        return new Response(JSON.stringify(brave));
      }
      return new Response(ugPage(ugResults));
    });
    const req = () => tabs.GET(new Request("https://guitar.test/api/tabs?q=Paul%20Gilbert%20Fuzz%20Universe"));

    vi.stubEnv("BRAVE_SEARCH_KEY", "");
    let body = await (await req()).json();
    expect(asked.some((u) => u.includes("brave"))).toBe(false);
    expect(body.failed).toEqual([]);

    vi.stubEnv("BRAVE_SEARCH_KEY", "k");
    body = await (await req()).json();
    expect(body.results.map((r: { source: string }) => r.source)).toEqual(["songsterr", "musescore", "musescore", "ug", "ug", "ug"]);
  });

  it("turns a video title into a search query", () => {
    expect(songQuery("Paul Gilbert - Fuzz Universe (Official Audio)")).toBe("Paul Gilbert Fuzz Universe");
    expect(songQuery("Metallica - Nothing Else Matters [Official Music Video] HD")).toBe("Metallica Nothing Else Matters");
    expect(songQuery("Кино — Группа крови (Live)")).toBe("Кино Группа крови");
    expect(songQuery("Artist - Song ft. Someone Else")).toBe("Artist Song");
  });
});
