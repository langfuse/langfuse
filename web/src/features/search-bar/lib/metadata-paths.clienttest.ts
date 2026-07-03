import { describe, expect, it } from "vitest";

import {
  collectMetadataPathTypes,
  MAX_PATHS_PER_PROJECT,
  mergePathType,
  withMetadataPathOptions,
  type StoredPathType,
} from "./metadata-paths";
import type { ObservedOptions } from "./observed-options";

describe("collectMetadataPathTypes", () => {
  it("flattens nested metadata into dot-paths with observed leaf types", () => {
    // The ticket's motivating example, as the JSON-encoded string rows carry.
    const collected = collectMetadataPathTypes([
      JSON.stringify({ hej: 123, heyhey: { abc: "hello" } }),
    ]);
    expect(collected.get("hej")).toBe("number");
    expect(collected.get("heyhey.abc")).toBe("string");
    expect(collected.size).toBe(2);
  });

  it("types booleans and treats arrays as leaves", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({ flag: true, tags: ["a", "b"], nested: { xs: [1] } }),
    ]);
    expect(collected.get("flag")).toBe("boolean");
    expect(collected.get("tags")).toBe("array");
    expect(collected.get("nested.xs")).toBe("array");
  });

  it("marks a path observed with two types across rows as mixed", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({ a: 1 }),
      JSON.stringify({ a: "x" }),
    ]);
    expect(collected.get("a")).toBe("mixed");
  });

  it("registers null-only paths without a type and upgrades them later", () => {
    const nullOnly = collectMetadataPathTypes([JSON.stringify({ a: null })]);
    expect(nullOnly.get("a")).toBe("");
    const upgraded = collectMetadataPathTypes([
      JSON.stringify({ a: null }),
      JSON.stringify({ a: "x" }),
    ]);
    expect(upgraded.get("a")).toBe("string");
  });

  it("accepts already-parsed objects and skips unparsable/non-object rows", () => {
    const collected = collectMetadataPathTypes([
      { direct: 1 },
      "not json{",
      '"just a string"',
      null,
      undefined,
      42,
    ]);
    expect([...collected.keys()]).toEqual(["direct"]);
  });

  it("caps nesting depth like the AI-context walker", () => {
    const collected = collectMetadataPathTypes([
      { a: { b: { c: { d: { e: 1 }, leaf: 2 } } } },
    ]);
    // depth 0..3 objects are walked; leaves at depth 3 are kept, deeper drop.
    expect(collected.get("a.b.c.leaf")).toBe("number");
    expect(collected.has("a.b.c.d.e")).toBe(false);
  });

  it("caps the number of collected paths", () => {
    const wide = Object.fromEntries(
      Array.from({ length: MAX_PATHS_PER_PROJECT + 50 }, (_, i) => [
        `k${i}`,
        i,
      ]),
    );
    const collected = collectMetadataPathTypes([wide]);
    expect(collected.size).toBe(MAX_PATHS_PER_PROJECT);
  });

  it("still merges types for known paths once the cap is reached", () => {
    const wide = Object.fromEntries(
      Array.from({ length: MAX_PATHS_PER_PROJECT }, (_, i) => [`k${i}`, i]),
    );
    const collected = collectMetadataPathTypes([wide, { k0: "now a string" }]);
    expect(collected.size).toBe(MAX_PATHS_PER_PROJECT);
    expect(collected.get("k0")).toBe("mixed");
  });

  it("skips empty, overlong, and __proto__ keys", () => {
    const collected = collectMetadataPathTypes([
      {
        "": 1,
        ["x".repeat(200)]: 2,
        ok: 3,
      },
      '{"__proto__": {"polluted": true}, "fine": 1}',
    ]);
    expect([...collected.keys()].sort()).toEqual(["fine", "ok"]);
  });
});

describe("mergePathType", () => {
  it("is mixed-absorbing and never demoted by null observations", () => {
    expect(mergePathType(undefined, "number")).toBe("number");
    expect(mergePathType("number", "number")).toBe("number");
    expect(mergePathType("number", "string")).toBe("mixed");
    expect(mergePathType("mixed", "number")).toBe("mixed");
    expect(mergePathType("mixed", "")).toBe("mixed");
    expect(mergePathType("number", "")).toBe("number");
    expect(mergePathType("", "string")).toBe("string");
    expect(mergePathType(undefined, null)).toBe("");
  });
});

describe("withMetadataPathOptions", () => {
  const observed: ObservedOptions = { level: [{ value: "ERROR" }] };

  it("keeps undefined observed undefined (loading semantics untouched)", () => {
    expect(withMetadataPathOptions(undefined, { a: "string" })).toBeUndefined();
  });

  it("returns the observed map unchanged without paths", () => {
    expect(withMetadataPathOptions(observed, undefined)).toBe(observed);
    expect(withMetadataPathOptions(observed, {})).toBe(observed);
  });

  it("merges sorted paths under `metadata`, omitting mixed/unknown types", () => {
    const paths: Record<string, StoredPathType> = {
      "routing.queue": "string",
      hej: "number",
      both: "mixed",
      nullish: "",
    };
    const out = withMetadataPathOptions(observed, paths);
    expect(out?.level).toBe(observed.level);
    expect(out?.metadata).toEqual([
      { value: "both" },
      { value: "hej", type: "number" },
      { value: "nullish" },
      { value: "routing.queue", type: "string" },
    ]);
  });
});
