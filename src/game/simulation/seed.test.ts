import { describe, expect, it } from "vitest";
import { hashString } from "./seed";

describe("string seeds", () => {
  it("is stable, unsigned and spreads nearby keys apart", () => {
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("2026-11-08")).toBe(hashString("2026-11-08"));
    expect(hashString("round-1")).not.toBe(hashString("round-2"));
    expect(hashString("series-x")).toBeGreaterThanOrEqual(0);
  });
});
