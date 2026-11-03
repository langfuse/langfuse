import { describe, expect, it } from "vitest";
import { DatasetJSONSchema } from "../server/datasets/schemaTypes";
import { isValidJSONSchema } from "./jsonSchemaValidation";

describe("DatasetJSONSchema size errors", () => {
  it("accepts schemas at the limit and reports oversized schemas distinctly", () => {
    const schemaAtLimit = {
      type: "string",
      description: "x".repeat(10_000),
    };
    while (JSON.stringify(schemaAtLimit).length > 10_000) {
      schemaAtLimit.description = schemaAtLimit.description.slice(0, -1);
    }
    while (JSON.stringify(schemaAtLimit).length < 10_000) {
      schemaAtLimit.description += "x";
    }

    expect(JSON.stringify(schemaAtLimit)).toHaveLength(10_000);
    expect(isValidJSONSchema(schemaAtLimit)).toBe(true);
    expect(DatasetJSONSchema.safeParse(schemaAtLimit).success).toBe(true);

    schemaAtLimit.description += "x";
    const result = DatasetJSONSchema.safeParse(schemaAtLimit);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Schema exceeds the 10,000-character limit",
      );
    }
  });

  it("preserves the invalid-schema error for schemas within the limit", () => {
    const result = DatasetJSONSchema.safeParse({ type: "invalid-type" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Must be a valid JSON Schema",
      );
    }
  });
});
