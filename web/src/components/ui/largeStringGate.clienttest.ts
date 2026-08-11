import {
  LARGE_STRING_RENDER_CHAR_LIMIT,
  isLargeRenderString,
} from "@/src/components/ui/largeStringGate";

describe("isLargeRenderString", () => {
  it("returns false for typical, KB-scale strings", () => {
    expect(isLargeRenderString("")).toBe(false);
    expect(isLargeRenderString("hello world")).toBe(false);
    expect(isLargeRenderString("a".repeat(100_000))).toBe(false);
    expect(isLargeRenderString("a".repeat(500_000))).toBe(false);
  });

  it("is bounded exactly at the limit (inclusive) and fires just above it", () => {
    // At the limit: still rendered normally (not gated).
    expect(
      isLargeRenderString("a".repeat(LARGE_STRING_RENDER_CHAR_LIMIT)),
    ).toBe(false);
    // One char over the limit: gated.
    expect(
      isLargeRenderString("a".repeat(LARGE_STRING_RENDER_CHAR_LIMIT + 1)),
    ).toBe(true);
  });

  it("gates multi-megabyte plain strings", () => {
    expect(isLargeRenderString("x".repeat(5_000_000))).toBe(true);
  });

  it("only gates strings — objects/arrays keep their own size guards", () => {
    expect(isLargeRenderString(null)).toBe(false);
    expect(isLargeRenderString(undefined)).toBe(false);
    expect(isLargeRenderString(42)).toBe(false);
    expect(isLargeRenderString(true)).toBe(false);
    // A huge object is handled by deepParseJson's object maxSize guard, not here.
    expect(isLargeRenderString({ a: "x".repeat(5_000_000) })).toBe(false);
    expect(isLargeRenderString(["x".repeat(5_000_000)])).toBe(false);
  });
});
