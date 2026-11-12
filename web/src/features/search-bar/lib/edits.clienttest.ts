// @vitest-environment node

import { describe, expect, it } from "vitest";

import { removeToken } from "./edits";
import { astToFilterState } from "./adapter";
import { EVENTS_FIELD_REGISTRY } from "./fields";
import { parse } from "./langQ";
import { applyTokenFacetAction, createTokenFacetState } from "./fns/tokenFacet";

function spanOf(text: string, token: string) {
  const from = text.indexOf(token);
  return { from, to: from + token.length };
}

describe("removeToken — semantic preservation", () => {
  it("applies Only to the complete negated condition in keyword and dash forms", () => {
    const token = "name:(alpha OR beta OR gamma)";
    for (const expression of [
      `-${token}`,
      `NOT ${token}`,
      `NOT (${token})`,
      `NOT NOT -${token}`,
    ]) {
      const query = `level:ERROR ${expression} env:dev`;
      const initial = createTokenFacetState(
        query,
        spanOf(query, token),
        EVENTS_FIELD_REGISTRY,
      )!;
      const next = applyTokenFacetAction(
        initial,
        [],
        { kind: "only", value: "beta" },
        EVENTS_FIELD_REGISTRY,
      );
      const parsed = parse(next.query);
      expect(parsed.valid).toBe(true);
      expect(astToFilterState(parsed.ast).filters).toEqual([
        {
          type: "stringOptions",
          column: "level",
          operator: "any of",
          value: ["ERROR"],
        },
        {
          type: "stringOptions",
          column: "name",
          operator: "any of",
          value: ["beta"],
        },
        {
          type: "stringOptions",
          column: "environment",
          operator: "any of",
          value: ["dev"],
        },
      ]);
    }
  });

  it("keeps all-of mode when an array group shrinks to one value and grows again", () => {
    const query = "tags:(alpha AND beta AND gamma)";
    const initial = createTokenFacetState(
      query,
      { from: 0, to: query.length },
      EVENTS_FIELD_REGISTRY,
    )!;
    const singleton = applyTokenFacetAction(
      initial,
      [],
      { kind: "selection", values: ["alpha"] },
      EVENTS_FIELD_REGISTRY,
    );
    const expanded = applyTokenFacetAction(
      singleton,
      [],
      { kind: "selection", values: ["alpha", "beta"] },
      EVENTS_FIELD_REGISTRY,
    );
    expect(astToFilterState(parse(expanded.query).ast).filters).toEqual([
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "all of",
        value: ["alpha", "beta"],
      },
    ]);
  });

  it("preserves an explicit ID list when its last unchecked known value is reselected", () => {
    const query = "id:(first-id OR second-id OR third-id)";
    const state = createTokenFacetState(
      query,
      { from: 0, to: query.length },
      EVENTS_FIELD_REGISTRY,
    )!;
    const unchecked = applyTokenFacetAction(
      state,
      [],
      { kind: "selection", values: ["first-id", "second-id"] },
      EVENTS_FIELD_REGISTRY,
    );
    const rechecked = applyTokenFacetAction(
      unchecked,
      [],
      { kind: "selection", values: ["first-id", "second-id", "third-id"] },
      EVENTS_FIELD_REGISTRY,
    );
    expect(astToFilterState(parse(rechecked.query).ast).filters).toEqual([
      {
        type: "stringOptions",
        column: "id",
        operator: "any of",
        value: ["first-id", "second-id", "third-id"],
      },
    ]);
  });

  it("edits only the clicked exclusion while keeping companion filters", () => {
    const expression = "-name:(old-a OR old-b OR old-c)";
    const query = `name:(keep-a OR keep-b OR keep-c) ${expression} tags:production`;
    const state = createTokenFacetState(
      query,
      spanOf(query, expression),
      EVENTS_FIELD_REGISTRY,
    )!;
    const next = applyTokenFacetAction(
      state,
      ["available"],
      { kind: "selection", values: ["available", "old-a"] },
      EVENTS_FIELD_REGISTRY,
    );
    const lowered = astToFilterState(parse(next.query).ast);
    expect(lowered.errors).toEqual([]);
    expect(lowered.filters).toEqual([
      {
        type: "stringOptions",
        column: "name",
        operator: "any of",
        value: ["keep-a", "keep-b", "keep-c"],
      },
      {
        type: "stringOptions",
        column: "name",
        operator: "none of",
        value: ["old-b", "old-c"],
      },
      {
        type: "arrayOptions",
        column: "traceTags",
        operator: "any of",
        value: ["production"],
      },
    ]);
  });

  it("keeps exact set matching when a value group shrinks to one", () => {
    for (const [prefix, operator] of [
      ["", "any of"],
      ["-", "none of"],
    ] as const) {
      const query = `${prefix}name:(alpha OR beta OR gamma)`;
      const state = createTokenFacetState(
        query,
        { from: 0, to: query.length },
        EVENTS_FIELD_REGISTRY,
      )!;
      const next = applyTokenFacetAction(
        state,
        [],
        {
          kind: "selection",
          values: prefix === "-" ? ["beta", "gamma"] : ["alpha"],
        },
        EVENTS_FIELD_REGISTRY,
      );
      const lowered = astToFilterState(parse(next.query).ast);
      expect(lowered.errors).toEqual([]);
      expect(lowered.filters).toEqual([
        { type: "stringOptions", column: "name", operator, value: ["alpha"] },
      ]);
    }
  });

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
