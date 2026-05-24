import { describe, expect, it } from "vitest";
import { useEventsTableSchema } from "./types";

describe("useEventsTableSchema", () => {
  it("should preserve undefined if query param is omitted", () => {
    expect(useEventsTableSchema.parse(undefined)).toBeUndefined();
  });

  it("should parse true and false string values if query param is provided", () => {
    expect(useEventsTableSchema.parse("true")).toBe(true);
    expect(useEventsTableSchema.parse("false")).toBe(false);
  });

  it("should parse boolean values if query param is provided", () => {
    expect(useEventsTableSchema.parse(true)).toBe(true);
    expect(useEventsTableSchema.parse(false)).toBe(false);
  });
});
