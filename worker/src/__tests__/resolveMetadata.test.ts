import { describe, it, expect } from "vitest";
import { resolveMetadata } from "@langfuse/shared/src/server";

describe("resolveMetadata", () => {
  it("returns empty object for null", () => {
    expect(resolveMetadata(null)).toEqual({});
  });

  it("returns empty object for undefined", () => {
    expect(resolveMetadata(undefined)).toEqual({});
  });

  it("returns the object as-is for a JSON object", () => {
    const input = { foo: "bar", count: 42 };
    expect(resolveMetadata(input)).toEqual({ foo: "bar", count: 42 });
  });

  it("wraps an array under a metadata key", () => {
    const input = [1, 2, 3];
    expect(resolveMetadata(input)).toEqual({ metadata: [1, 2, 3] });
  });

  it("wraps a string primitive under a metadata key", () => {
    expect(resolveMetadata("some-string")).toEqual({
      metadata: "some-string",
    });
  });

  it("wraps a number primitive under a metadata key", () => {
    expect(resolveMetadata(42)).toEqual({ metadata: 42 });
  });

  it("wraps a boolean primitive under a metadata key", () => {
    expect(resolveMetadata(true)).toEqual({ metadata: true });
  });

  it("handles nested objects", () => {
    const input = { nested: { deep: "value" }, tags: ["a", "b"] };
    expect(resolveMetadata(input)).toEqual({
      nested: { deep: "value" },
      tags: ["a", "b"],
    });
  });
});
