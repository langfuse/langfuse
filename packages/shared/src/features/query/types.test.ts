import { describe, expect, it } from "vitest";
import { useEventsTableSchema } from "./types";

describe("useEventsTableSchema", () => {
  it("parses the string 'true' to true", () => {
    expect(useEventsTableSchema.parse("true")).toBe(true);
  });

  it("parses the string 'false' to false", () => {
    expect(useEventsTableSchema.parse("false")).toBe(false);
  });

  it("parses the boolean true to true", () => {
    expect(useEventsTableSchema.parse(true)).toBe(true);
  });

  it("parses the boolean false to false", () => {
    expect(useEventsTableSchema.parse(false)).toBe(false);
  });

  // Regression for #13814: an omitted query param must stay undefined so route
  // handlers can fall back to LANGFUSE_ENABLE_EVENTS_TABLE_OBSERVATIONS instead
  // of being coerced to false.
  it("preserves undefined when the value is omitted", () => {
    expect(useEventsTableSchema.parse(undefined)).toBeUndefined();
  });
});
