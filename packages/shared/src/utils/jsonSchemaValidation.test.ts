import { describe, expect, it } from "vitest";
import {
  isValidJSONSchema,
  validateFieldAgainstSchema,
} from "./jsonSchemaValidation";

describe("JSON Schema draft 2020-12", () => {
  it("accepts a schema that declares draft 2020-12 and applies its keywords", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "array",
      prefixItems: [{ type: "string" }, { type: "number" }],
      minItems: 2,
      items: false,
    };

    expect(isValidJSONSchema(schema)).toBe(true);
    expect(validateFieldAgainstSchema({ data: ["a", 1], schema })).toEqual({
      isValid: true,
    });
    expect(validateFieldAgainstSchema({ data: [1, "a"], schema }).isValid).toBe(
      false,
    );
  });
});
