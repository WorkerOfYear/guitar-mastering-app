import { describe, expect, it } from "vitest";
import { parseYouTube, withScheme } from "./youtubeLink";

describe("YouTube links", () => {
  it("accepts a link copied without https://", () => {
    expect(parseYouTube("youtube.com/watch?v=UVlic5NXpzw&list=RDUVlic5NXpzw&start_radio=1")).toEqual({ youtubeId: "UVlic5NXpzw", start: 0 });
    expect(parseYouTube("www.youtube.com/watch?v=UVlic5NXpzw&t=1m13s")).toEqual({ youtubeId: "UVlic5NXpzw", start: 73 });
    expect(withScheme(" youtube.com/watch?v=UVlic5NXpzw ")).toBe("https://youtube.com/watch?v=UVlic5NXpzw");
    expect(withScheme("https://youtu.be/UVlic5NXpzw")).toBe("https://youtu.be/UVlic5NXpzw");
  });
  it("reads short, mobile, shorts and embed links", () => {
    expect(parseYouTube("https://youtu.be/UVlic5NXpzw?t=73")).toEqual({ youtubeId: "UVlic5NXpzw", start: 73 });
    expect(parseYouTube("m.youtube.com/watch?v=UVlic5NXpzw")?.youtubeId).toBe("UVlic5NXpzw");
    expect(parseYouTube("https://www.youtube.com/shorts/UVlic5NXpzw")?.youtubeId).toBe("UVlic5NXpzw");
    expect(parseYouTube("https://www.youtube.com/embed/UVlic5NXpzw?start=30")).toEqual({ youtubeId: "UVlic5NXpzw", start: 30 });
  });
  it("rejects what isn't a YouTube video", () => {
    expect(parseYouTube("https://example.com/watch?v=UVlic5NXpzw")).toBeNull();
    expect(parseYouTube("youtube.com")).toBeNull();
    expect(parseYouTube("просто текст")).toBeNull();
  });
});
