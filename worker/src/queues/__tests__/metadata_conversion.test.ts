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
});
