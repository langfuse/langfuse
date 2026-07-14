import { describe, expect, it } from "vitest";
import {
  isDatasetJsonParseFailure,
  isValidDatasetJson,
  parseDatasetJson,
} from "./parseDatasetJson";

describe("parseDatasetJson", () => {
  it("preserves unsafe JSON numbers as strings", () => {
    expect(parseDatasetJson("107505301260286111")).toBe("107505301260286111");
    expect(parseDatasetJson('{"id":107505301260286111}')).toEqual({
      id: "107505301260286111",
    });
  });

  it("validates JSON without rejecting unsafe root numbers", () => {
    expect(isValidDatasetJson("107505301260286111")).toBe(true);
    expect(isValidDatasetJson('{"id":107505301260286111}')).toBe(true);
    expect(isValidDatasetJson("null")).toBe(true);
    expect(isValidDatasetJson("plain")).toBe(false);
  });

  it("detects invalid JSON without treating unsafe root numbers as failures", () => {
    expect(isDatasetJsonParseFailure("plain")).toBe(true);
    expect(isDatasetJsonParseFailure("{")).toBe(true);
    expect(isDatasetJsonParseFailure("107505301260286111")).toBe(false);
    expect(isDatasetJsonParseFailure("null")).toBe(false);
  });
});
