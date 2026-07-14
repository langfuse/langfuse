import {
  commaSeparatedEnumArray,
  isJsonNumberLiteral,
  optionalCommaSeparatedStringArray,
  paginationZod,
  parseJsonPrioritised,
  publicApiPaginationLimitZod,
} from "@langfuse/shared";
import { ZodError } from "zod";

// Create test cases
describe("Pagination Zod Schema", () => {
  it("should validate valid input", () => {
    const pageResult = paginationZod.page.parse("2");
    const limitResult = paginationZod.limit.parse("20");

    expect(pageResult).toBe(2);
    expect(limitResult).toBe(20);
  });

  it("should handle empty values", () => {
    const pageResult = paginationZod.page.parse("");
    const limitResult = paginationZod.limit.parse("");

    expect(pageResult).toBe(1);
    expect(limitResult).toBe(50);
  });

  it("should handle invalid input", () => {
    expect(() => paginationZod.page.parse("abc")).toThrow(ZodError);
    expect(() => paginationZod.limit.parse("abc")).toThrow(ZodError);
    expect(() => paginationZod.limit.parse("0")).toThrow(ZodError);
    expect(() => paginationZod.limit.parse("1.5")).toThrow(ZodError);
  });
});

describe("Public API pagination limit Zod Schema", () => {
  it("validates integer limits with public API defaults", () => {
    expect(publicApiPaginationLimitZod.parse("20")).toBe(20);
    expect(publicApiPaginationLimitZod.parse("")).toBe(50);
    expect(() => publicApiPaginationLimitZod.parse("1.5")).toThrow(ZodError);
    expect(() => publicApiPaginationLimitZod.parse("101")).toThrow(ZodError);
  });
});

describe("Comma-separated query parameter Zod schemas", () => {
  it("parses optional comma-separated string arrays", () => {
    expect(optionalCommaSeparatedStringArray.parse("a, b,,c ")).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(optionalCommaSeparatedStringArray.parse("")).toBeUndefined();
    expect(optionalCommaSeparatedStringArray.parse(undefined)).toBeUndefined();
  });

  it("parses comma-separated enum arrays with defaults", () => {
    const schema = commaSeparatedEnumArray(["core", "metadata"] as const, [
      "core",
    ]);

    expect(schema.parse("core, metadata")).toEqual(["core", "metadata"]);
    expect(schema.parse(undefined)).toEqual(["core"]);
    expect(() => schema.parse("core,invalid")).toThrow(ZodError);
  });

  it("can filter unknown comma-separated enum values", () => {
    const schema = commaSeparatedEnumArray(
      ["core", "metadata"] as const,
      ["core"],
      { unknownValues: "filter" },
    );

    expect(schema.parse("core, invalid,metadata")).toEqual([
      "core",
      "metadata",
    ]);
    expect(schema.parse("invalid")).toEqual([]);
  });

  it("supports null defaults for omitted comma-separated enum values", () => {
    const schema = commaSeparatedEnumArray(
      ["core", "metadata"] as const,
      null,
      { unknownValues: "filter" },
    );

    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse("invalid")).toEqual([]);
  });
});

describe("parseJsonPrioritised", () => {
  it.each([
    ["test", "test"], // Raw string
    ['{"hello": "world"}', { hello: "world" }], // Simple object
    ["[1, 2, 3]", [1, 2, 3]], // Array
    ['{"nested": {"key": "value"}}', { nested: { key: "value" } }], // Nested object
    ["[]", []], // Empty array
    ["{}", {}], // Empty object
    ['"simple string"', "simple string"], // Quoted string
    ["42", 42], // Number
    ["true", true], // Boolean true
    ["false", false], // Boolean false
    ["null", null], // Null
    ["", ""], // Empty string
    ["invalid{json}", "invalid{json}"], // Invalid JSON string
    ['{"hello": "world"', '{"hello": "world"'], // Invalid JSON string
    ['[null, 123, "abc"]', [null, 123, "abc"]], // Mixed array
    [
      '{"array": [1, 2], "nested": {"key": "value"}}',
      { array: [1, 2], nested: { key: "value" } },
    ], // Complex object
    ["1983516295378495150", "1983516295378495150"], // Large number
    ["3.4", 3.4], // Decimal number
  ])(
    "should parse input correctly  (%s, %s)",
    (input: string, expectedOutput: any) => {
      expect(parseJsonPrioritised(input)).toEqual(expectedOutput);
    },
  );
});

describe("isJsonNumberLiteral", () => {
  it("validates complete JSON number literals", () => {
    expect(isJsonNumberLiteral("107505301260286111")).toBe(true);
    expect(isJsonNumberLiteral("-1.23e+4")).toBe(true);
    expect(isJsonNumberLiteral("plain107505301260286111")).toBe(false);
    expect(isJsonNumberLiteral("01")).toBe(false);
  });
});
