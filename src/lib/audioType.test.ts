import { describe, expect, it } from "vitest";
import { audioFileName, audioType } from "./audioType";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(Array(16).fill(0))).buffer;

describe("audio type from the file header", () => {
  it("recognises the formats a recording comes in", () => {
    expect(audioType(bytes([0, 0, 0, 0x20], "ftypM4A "))?.ext).toBe("m4a");
    expect(audioType(bytes("ID3", [4, 0]))?.ext).toBe("mp3");
    expect(audioType(bytes([0xff, 0xfb, 0x90, 0x64]))?.ext).toBe("mp3");
    expect(audioType(bytes([0x1a, 0x45, 0xdf, 0xa3]))?.mime).toBe("audio/webm");
    expect(audioType(bytes("RIFF", [0, 0, 0, 0], "WAVE"))?.ext).toBe("wav");
    expect(audioType(bytes("hello world, plain text")) ).toBeNull();
  });
  it("names the download after the recording with the right extension", () => {
    expect(audioFileName("Racer X - Technical Difficulties (Official Audio).audio", bytes([0, 0, 0, 0x20], "ftypM4A "))).toBe(
      "Racer X - Technical Difficulties (Official Audio).m4a",
    );
    expect(audioFileName("song.mp3", bytes("ID3"))).toBe("song.mp3");
  });
});
