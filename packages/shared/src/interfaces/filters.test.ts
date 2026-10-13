import { describe, expect, it } from "vitest";

import {
  singleFilter,
  singleFilterList,
  eventsTableSingleFilter,
  eventsTableSingleFilterList,
  coerceLegacyEmptyMetadataFilters,
} from "./filters";

const metadataFilter = (operator: string, value: string) => ({
  type: "stringObject" as const,
  column: "metadata",
  key: "turn",
  operator,
  value,
});

describe("stringObject empty substring handling", () => {
  it.each(["contains", "starts with", "ends with"])(
    "no longer rejects an empty value for the substring operator %s at the single-filter schema",
    (operator) => {
      expect(singleFilter.safeParse(metadataFilter(operator, "")).success).toBe(
        true,
      );
      expect(
        eventsTableSingleFilter.safeParse(metadataFilter(operator, "")).success,
      ).toBe(true);
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

describe("singleFilterList", () => {
  it.each(["contains", "starts with", "ends with"])(
    "coerces a legacy empty-value %s metadata filter to `is set`",
    (operator) => {
      const result = singleFilterList.safeParse([metadataFilter(operator, "")]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].operator).toBe("is set");
      }
    },
  );

  it("leaves a non-empty substring filter untouched", () => {
    const result = singleFilterList.safeParse([
      metadataFilter("contains", "x"),
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].operator).toBe("contains");
    }
  });
});

describe("eventsTableSingleFilterList", () => {
  it.each(["contains", "starts with", "ends with"])(
    "coerces a legacy empty-value %s metadata filter to `is set`",
    (operator) => {
      const result = eventsTableSingleFilterList.safeParse([
        metadataFilter(operator, ""),
      ]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data[0].operator).toBe("is set");
      }
    },
  );

  it("leaves a non-empty substring filter untouched", () => {
    const result = eventsTableSingleFilterList.safeParse([
      metadataFilter("contains", "x"),
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0].operator).toBe("contains");
    }
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
