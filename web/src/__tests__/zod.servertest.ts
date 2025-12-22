import { paginationZod, parseJsonPrioritised } from "@langfuse/shared";
import { ZodError } from "zod/v4";

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
