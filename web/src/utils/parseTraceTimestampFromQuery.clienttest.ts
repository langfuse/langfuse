import { describe, expect, it } from "vitest";

import { parseTraceTimestampFromQuery } from "@/src/utils/parseTraceTimestampFromQuery";

describe("parseTraceTimestampFromQuery", () => {
  it("parses a valid ISO timestamp", () => {
    const iso = "2026-07-20T12:00:00.000Z";
    const date = parseTraceTimestampFromQuery(iso);
    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe(iso);
  });

  it("parses a URL-encoded ISO timestamp", () => {
    const iso = "2026-07-20T12:00:00.000Z";
    const date = parseTraceTimestampFromQuery(encodeURIComponent(iso));
    expect(date?.toISOString()).toBe(iso);
  });

  it("returns undefined for malformed percent-encoding without throwing", () => {
    expect(() => parseTraceTimestampFromQuery("%")).not.toThrow();
    expect(parseTraceTimestampFromQuery("%")).toBeUndefined();
  });

  it("returns undefined for non-date strings", () => {
    expect(parseTraceTimestampFromQuery("not-a-date")).toBeUndefined();
  });

  it("returns undefined for array query values", () => {
    expect(
      parseTraceTimestampFromQuery(["2026-07-20T12:00:00.000Z"]),
    ).toBeUndefined();
  });

  it("returns undefined for empty or missing values", () => {
    expect(parseTraceTimestampFromQuery(undefined)).toBeUndefined();
    expect(parseTraceTimestampFromQuery("")).toBeUndefined();
  });
});
