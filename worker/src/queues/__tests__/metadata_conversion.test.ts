import { describe, it, expect } from "vitest";
import { metadataArraysToRecord } from "@langfuse/shared/src/server";

describe("metadataArraysToRecord", () => {
  it("should return undefined for empty arrays", () => {
    expect(metadataArraysToRecord([], [])).toBeUndefined();
  });

  it("should zip names and values into a record", () => {
    const result = metadataArraysToRecord(["env", "version"], ["prod", "1.0"]);
    expect(result).toEqual({ env: "prod", version: "1.0" });
  });

  it("should keep the first occurrence when keys are duplicated", () => {
    const result = metadataArraysToRecord(
      ["env", "env", "env"],
      ["first", "second", "third"],
    );
    expect(result).toEqual({ env: "first" });
  });

  it("should handle a single entry", () => {
    const result = metadataArraysToRecord(["key"], ["value"]);
    expect(result).toEqual({ key: "value" });
  });

  it("should keep keys that collide with Object.prototype members", () => {
    const result = metadataArraysToRecord(
      ["toString", "constructor", "valueOf", "hasOwnProperty"],
      ["a", "b", "c", "d"],
    );
    expect(result).toEqual({
      toString: "a",
      constructor: "b",
      valueOf: "c",
      hasOwnProperty: "d",
    });
  });

  it("should keep a __proto__ key as an own property", () => {
    const result = metadataArraysToRecord(
      ["__proto__", "env"],
      ['{"polluted":true}', "prod"],
    );

    expect(Object.keys(result ?? {})).toEqual(["__proto__", "env"]);
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
