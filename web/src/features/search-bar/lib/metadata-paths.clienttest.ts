import { describe, expect, it } from "vitest";

import {
  collectMetadataPathTypes,
  MAX_PATHS_PER_PROJECT,
  MAX_VALUES_PER_KEY,
  mergePathType,
  withMetadataPathOptions,
  type StoredKeyInfo,
} from "./metadata-paths";
import type { ObservedOptions } from "./observed-options";

describe("collectMetadataPathTypes", () => {
  it("records top-level keys with observed value types", () => {
    // The ticket's motivating example, as the JSON-encoded string rows carry.
    // `heyhey` is a nested branch: stored server-side as ONE Map key whose
    // value is a JSON string, so it is suggested as an "object" key — never
    // flattened to `heyhey.abc`, which would not be filterable.
    const collected = collectMetadataPathTypes([
      JSON.stringify({ hej: 123, heyhey: { abc: "hello" } }),
    ]);
    expect(collected.get("hej")?.type).toBe("number");
    expect(collected.get("heyhey")?.type).toBe("object");
    expect(collected.has("heyhey.abc")).toBe(false);
    expect(collected.size).toBe(2);
  });

  it("keeps dotted top-level keys as-is (the OTel attribute shape)", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({ "gen_ai.request.model": "gpt-4o", "shape.depth": 3 }),
    ]);
    expect(collected.get("gen_ai.request.model")?.type).toBe("string");
    expect(collected.get("shape.depth")?.type).toBe("number");
  });

  it("types booleans and arrays", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({ flag: true, tags: ["a", "b"] }),
    ]);
    expect(collected.get("flag")?.type).toBe("boolean");
    expect(collected.get("tags")?.type).toBe("array");
  });

  it("marks a key observed with two types across rows as mixed", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({ a: 1 }),
      JSON.stringify({ a: "x" }),
    ]);
    expect(collected.get("a")?.type).toBe("mixed");
  });

  it("registers null-only keys without a type and upgrades them later", () => {
    const nullOnly = collectMetadataPathTypes([JSON.stringify({ a: null })]);
    expect(nullOnly.get("a")?.type).toBe("");
    const upgraded = collectMetadataPathTypes([
      JSON.stringify({ a: null }),
      JSON.stringify({ a: "x" }),
    ]);
    expect(upgraded.get("a")?.type).toBe("string");
  });

  it("collects distinct scalar values per key, stringified", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({ region: "eu", turn: 3, flag: true }),
      JSON.stringify({ region: "us", turn: 3 }),
      JSON.stringify({ region: "eu" }),
    ]);
    expect(collected.get("region")?.values).toEqual(["eu", "us"]);
    expect(collected.get("turn")?.values).toEqual(["3"]);
    expect(collected.get("flag")?.values).toEqual(["true"]);
  });

  it("caps values per key at first-observed distinct", () => {
    const rows = Array.from({ length: MAX_VALUES_PER_KEY + 3 }, (_, i) =>
      JSON.stringify({ region: `region-${i}` }),
    );
    const collected = collectMetadataPathTypes(rows);
    expect(collected.get("region")?.values).toHaveLength(MAX_VALUES_PER_KEY);
    expect(collected.get("region")?.values?.[0]).toBe("region-0");
  });

  it("never collects values for object/array/null leaves or empty strings", () => {
    const collected = collectMetadataPathTypes([
      JSON.stringify({
        scope: { name: "x" },
        tags: ["a"],
        nothing: null,
        blank: "",
      }),
    ]);
    expect(collected.get("scope")?.values).toBeUndefined();
    expect(collected.get("tags")?.values).toBeUndefined();
    expect(collected.get("nothing")?.values).toBeUndefined();
    expect(collected.get("blank")?.values).toBeUndefined();
  });

  it("skips overlong values entirely instead of truncating them", () => {
    // A truncated value would insert a filter that matches nothing.
    const collected = collectMetadataPathTypes([
      JSON.stringify({ long: "x".repeat(200), short: "ok" }),
    ]);
    expect(collected.get("long")?.type).toBe("string");
    expect(collected.get("long")?.values).toBeUndefined();
    expect(collected.get("short")?.values).toEqual(["ok"]);
  });

  it("accepts already-parsed objects and skips unparsable/non-object rows", () => {
    const collected = collectMetadataPathTypes([
      { direct: 1 },
      "not json{",
      '"just a string"',
      "[1, 2]",
      null,
      undefined,
      42,
    ]);
    expect([...collected.keys()]).toEqual(["direct"]);
  });

  it("caps the number of collected keys", () => {
    const wide = Object.fromEntries(
      Array.from({ length: MAX_PATHS_PER_PROJECT + 50 }, (_, i) => [
        `k${i}`,
        i,
      ]),
    );
    const collected = collectMetadataPathTypes([wide]);
    expect(collected.size).toBe(MAX_PATHS_PER_PROJECT);
  });

  it("still merges types for known keys once the cap is reached", () => {
    const wide = Object.fromEntries(
      Array.from({ length: MAX_PATHS_PER_PROJECT }, (_, i) => [`k${i}`, i]),
    );
    const collected = collectMetadataPathTypes([wide, { k0: "now a string" }]);
    expect(collected.size).toBe(MAX_PATHS_PER_PROJECT);
    expect(collected.get("k0")?.type).toBe("mixed");
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
    expect(
      withMetadataPathOptions(undefined, { a: { type: "string" } }),
    ).toBeUndefined();
  });

  it("returns the observed map unchanged without paths", () => {
    expect(withMetadataPathOptions(observed, undefined)).toBe(observed);
    expect(withMetadataPathOptions(observed, {})).toBe(observed);
  });

  it("merges sorted keys under `metadata`, omitting mixed/unknown types", () => {
    const paths: Record<string, StoredKeyInfo> = {
      "routing.queue": { type: "string" },
      hej: { type: "number" },
      scope: { type: "object" },
      both: { type: "mixed" },
      nullish: { type: "" },
    };
    const out = withMetadataPathOptions(observed, paths);
    expect(out?.level).toBe(observed.level);
    expect(out?.metadata).toEqual([
      { value: "both" },
      { value: "hej", type: "number" },
      { value: "nullish" },
      { value: "routing.queue", type: "string" },
      { value: "scope", type: "object" },
    ]);
  });

  it("exposes per-key values under `metadata.<key>` for the value stage", () => {
    const paths: Record<string, StoredKeyInfo> = {
      region: { type: "string", values: ["eu", "us"] },
      scope: { type: "object" },
    };
    const out = withMetadataPathOptions(observed, paths);
    expect(out?.["metadata.region"]).toEqual([
      { value: "eu" },
      { value: "us" },
    ]);
    expect(out?.["metadata.scope"]).toBeUndefined();
  });
});
