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

  it("splices a plain adjacent filter, preserving the neighbor unchanged", () => {
    const text = "level:ERROR env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("env:dev");
  });

  it("keeps a negated neighbor negated when removing an earlier filter", () => {
    const text = "level:ERROR -env:dev";
    expect(removeToken(text, spanOf(text, "level:ERROR"))).toBe("-env:dev");
  });
});
