import { describe, expect, it } from "vitest";

import { singleFilter, eventsTableSingleFilter } from "./filters";

const metadataFilter = (operator: string, value: string) => ({
  type: "stringObject" as const,
  column: "metadata",
  key: "turn",
  operator,
  value,
});

describe("stringObject empty-value guard", () => {
  it.each(["contains", "starts with", "ends with"])(
    "rejects an empty value for the substring operator %s",
    (operator) => {
      expect(singleFilter.safeParse(metadataFilter(operator, "")).success).toBe(
        false,
      );
      expect(
        eventsTableSingleFilter.safeParse(metadataFilter(operator, "")).success,
      ).toBe(false);
    },
  );

  it.each(["contains", "starts with", "ends with"])(
    "accepts a non-empty value for the substring operator %s",
    (operator) => {
      expect(
        singleFilter.safeParse(metadataFilter(operator, "x")).success,
      ).toBe(true);
    },
  );

  it.each(["is set", "is not set"])(
    "accepts the presence operator %s with an empty value",
    (operator) => {
      expect(singleFilter.safeParse(metadataFilter(operator, "")).success).toBe(
        true,
      );
    },
  );

  it("accepts an empty value for = and does not contain", () => {
    expect(singleFilter.safeParse(metadataFilter("=", "")).success).toBe(true);
    expect(
      singleFilter.safeParse(metadataFilter("does not contain", "")).success,
    ).toBe(true);
  });
});
