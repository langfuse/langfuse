import { describe, it, expect } from "vitest";
import { z } from "zod";

import { useEventsTableSchema } from "./types";

describe("useEventsTableSchema", () => {
  it("preserves undefined when query param is omitted", () => {
    const schema = z.object({ useEventsTable: useEventsTableSchema });
    const parsed = schema.parse({});
    expect(parsed.useEventsTable).toBeUndefined();
  });

  it("parses boolean-like values", () => {
    expect(useEventsTableSchema.parse("true")).toBe(true);
    expect(useEventsTableSchema.parse("false")).toBe(false);
    expect(useEventsTableSchema.parse(true)).toBe(true);
    expect(useEventsTableSchema.parse(false)).toBe(false);
  });
});
