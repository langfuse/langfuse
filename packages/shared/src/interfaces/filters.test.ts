import { describe, expect, it } from "vitest";

import {
  singleFilter,
  eventsTableSingleFilter,
  coerceLegacyEmptyMetadataFilters,
} from "./filters";

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

describe("coerceLegacyEmptyMetadataFilters", () => {
  it.each(["contains", "starts with", "ends with"])(
    "rewrites a legacy empty-value %s metadata filter to `is set` so it parses",
    (operator) => {
      const coerced = coerceLegacyEmptyMetadataFilters([
        metadataFilter(operator, ""),
      ]);
      expect((coerced as { operator: string }[])[0].operator).toBe("is set");
      expect(singleFilter.safeParse((coerced as unknown[])[0]).success).toBe(
        true,
      );
    },
  );

  it("leaves non-empty and non-substring filters untouched", () => {
    const input = [
      metadataFilter("contains", "x"),
      metadataFilter("=", ""),
      { type: "string", column: "name", operator: "contains", value: "" },
    ];
    expect(coerceLegacyEmptyMetadataFilters(input)).toEqual(input);
  });

  it("passes through non-array input unchanged", () => {
    expect(coerceLegacyEmptyMetadataFilters(null)).toBe(null);
  });
});
