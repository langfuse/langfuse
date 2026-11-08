import { describe, expect, it } from "vitest";
import { DatasetSchemaValidator } from "./DatasetSchemaValidator";

describe("DatasetSchemaValidator", () => {
  it("validates a draft-07 input schema and a draft 2020-12 expected output schema side by side", () => {
    const validator = new DatasetSchemaValidator({
      inputSchema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        type: "array",
        items: [{ type: "string" }, { type: "number" }],
        minItems: 2,
        additionalItems: false,
      },
      expectedOutputSchema: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "array",
        prefixItems: [{ type: "string" }, { type: "boolean" }],
        minItems: 2,
        items: false,
      },
    });

    expect(validator.validateInput(["a", 1])).toEqual({ isValid: true });
    expect(validator.validateInput([1, "a"]).isValid).toBe(false);
    expect(validator.validateOutput(["a", true])).toEqual({ isValid: true });
    expect(validator.validateOutput([true, "a"]).isValid).toBe(false);
  });
});
