import { describe, expect, it } from "vitest";

import { removeToken } from "./edits";

function spanOf(text: string, token: string) {
  const from = text.indexOf(token);
  return { from, to: from + token.length };
}

describe("removeToken — semantic preservation", () => {
  // A bare parse check is not enough: removing `level:ERROR` from
  // `NOT level:ERROR env:dev` splices to `NOT env:dev`, which parses fine but
  // re-binds the stranded NOT keyword onto env:dev and silently inverts its
  // polarity. The removal must collapse the orphaned NOT instead.
  it("collapses a stranded NOT keyword instead of re-binding it to the neighbor", () => {
    const text = "NOT level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("env:dev");
  });

  it("removes the whole dash-form negation pill", () => {
    const text = "-level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "-level:ERROR"))).toBe("env:dev");
  });

  it("keeps a surviving invalid `-foo` as-is instead of stripping the dash", () => {
    // `-foo` is an invalid free-text negation. Removing the neighbor must leave
    // `-foo` exactly (still red), NOT silently canonicalize to `foo` and commit
    // a free-text search the user never confirmed.
    const text = "-foo level:ERROR";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("-foo");
    const text2 = "level:ERROR -foo";
    expect(removeToken(text2, spanOf(text2, "level:ERROR"))).toBe("-foo");
  });

  it("splices a plain adjacent filter, preserving the neighbor unchanged", () => {
    const text = "level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("env:dev");
  });

  it("keeps a negated neighbor negated when removing an earlier filter", () => {
    const text = "level:ERROR -env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("-env:dev");
  });

  // A coalesced free-text chip spans several text leaves; its × target span
  // matches none of them exactly, so removal must drop the contained leaves.
  it("removes a multi-word free-text chip as one unit", () => {
    expect(
      removeToken("refund policy", spanOf("refund policy", "refund policy")),
    ).toBe("");
    const text = "level:ERROR refund policy";
    expect(removeToken(text, spanOf(text, "refund policy"))).toBe(
      "level:ERROR",
    );
  });

  // An invalid `-foo` free-text-negation chip: the × target token span includes
  // the leading dash, but the inner text leaf's span does not — removal must
  // still drop the whole token, not strip the dash and keep `foo`.
  it("removes an invalid -word negation chip whole, not just the dash", () => {
    expect(removeToken("-foo", spanOf("-foo", "-foo"))).toBe("");
    const text = "level:ERROR -foo";
    expect(removeToken(text, spanOf(text, "-foo"))).toBe("level:ERROR");
  });
});
