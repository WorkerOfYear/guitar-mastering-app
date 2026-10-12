import { describe, expect, it } from "vitest";
import { fileTitle } from "./titles";

describe("fileTitle", () => {
  it("drops the extension, track number and underscores", () => {
    expect(fileTitle("01_Technical-Difficulties (live).mp3")).toBe("Technical-Difficulties (live)");
    expect(fileTitle("Mr. Big - Daddy, Brother.gp5")).toBe("Mr. Big - Daddy, Brother");
    expect(fileTitle("Ascend.m4a")).toBe("Ascend");
    expect(fileTitle("1984.mp3")).toBe("1984");
  });
});
