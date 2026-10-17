import { describe, expect, it } from "vitest";
import { parseInstagram, parseVideo, videoShortUrl } from "./videoLink";

describe("Instagram links", () => {
  it("reads reels, posts and IGTV, with or without https:// and the user name", () => {
    expect(parseInstagram("https://www.instagram.com/reel/C9xYz_12AbC/?igsh=MWQ1ZGUxMzBkMA==")).toEqual({ instagramId: "C9xYz_12AbC" });
    expect(parseInstagram("instagram.com/reels/C9xYz_12AbC")).toEqual({ instagramId: "C9xYz_12AbC" });
    expect(parseInstagram("https://instagram.com/p/C9xYz-12AbC/")).toEqual({ instagramId: "C9xYz-12AbC" });
    expect(parseInstagram("https://www.instagram.com/tv/B8abcdEFgh1/")).toEqual({ instagramId: "B8abcdEFgh1" });
    expect(parseInstagram("https://www.instagram.com/some.guitarist/reel/C9xYz_12AbC/")).toEqual({ instagramId: "C9xYz_12AbC" });
    expect(parseInstagram("https://m.instagram.com/reel/C9xYz_12AbC")).toEqual({ instagramId: "C9xYz_12AbC" });
  });
  it("rejects profiles, stories and other sites", () => {
    expect(parseInstagram("https://www.instagram.com/some.guitarist/")).toBeNull();
    expect(parseInstagram("https://www.instagram.com/stories/some.guitarist/3412345678901234567/")).toBeNull();
    expect(parseInstagram("https://example.com/reel/C9xYz_12AbC")).toBeNull();
    expect(parseInstagram("просто текст")).toBeNull();
  });
});

describe("parseVideo", () => {
  it("takes YouTube and Instagram links", () => {
    expect(parseVideo("https://youtu.be/UVlic5NXpzw?t=73")).toEqual({ youtubeId: "UVlic5NXpzw", start: 73 });
    expect(parseVideo("instagram.com/reel/C9xYz_12AbC")).toEqual({ instagramId: "C9xYz_12AbC" });
    expect(parseVideo("https://example.com")).toBeNull();
  });
  it("shows a short address", () => {
    expect(videoShortUrl({ youtubeId: "UVlic5NXpzw" })).toBe("youtu.be/UVlic5NXpzw");
    expect(videoShortUrl({ instagramId: "C9xYz_12AbC" })).toBe("instagram.com/reel/C9xYz_12AbC");
  });
});
