import { polymorphicValue } from "@/src/features/public-api/server/scores-api-v3";

describe("polymorphicValue", () => {
  it.each([
    [{ dataType: "NUMERIC" as const, value: 0.85 }, 0.85],
    [{ dataType: "BOOLEAN" as const, value: 1, stringValue: "true" }, true],
    [{ dataType: "BOOLEAN" as const, value: 0, stringValue: "false" }, false],
    [
      { dataType: "CATEGORICAL" as const, value: 0, stringValue: "good" },
      "good",
    ],
    [
      { dataType: "TEXT" as const, value: 0, stringValue: "Great explanation" },
      "Great explanation",
    ],
    [
      {
        dataType: "CORRECTION" as const,
        value: 0,
        stringValue: null,
        longStringValue: "corrected output",
      },
      "corrected output",
    ],
  ] as const)("returns expected value for %o", (input, expected) => {
    expect(polymorphicValue(input)).toBe(expected);
  });

  it.each([
    [{ dataType: "CATEGORICAL" as const, value: 0, stringValue: null }],

    [{ dataType: "UNKNOWN" as any, value: 0 }],
  ])("throws for invalid input %o", (input) => {
    expect(() => polymorphicValue(input)).toThrow();
  });
});
