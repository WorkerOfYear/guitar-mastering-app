import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("resolveTheme", () => {
  it("a choice in settings wins", () => {
    expect(resolveTheme("light", "dark")).toBe("light");
    expect(resolveTheme("dark", "light", true)).toBe("dark");
  });
  it("auto follows Telegram, else the system, else dark", () => {
    expect(resolveTheme("auto", "light")).toBe("light");
    expect(resolveTheme("auto", undefined, true)).toBe("light");
    expect(resolveTheme("auto")).toBe("dark");
  });
});
