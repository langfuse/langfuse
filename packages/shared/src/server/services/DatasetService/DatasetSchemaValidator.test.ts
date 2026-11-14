import { describe, expect, it } from "vitest";
import { DatasetJSONSchema } from "../../datasets/schemaTypes";
import { validateFieldAgainstSchema } from "../../../utils/jsonSchemaValidation";
import { DatasetSchemaValidator } from "./DatasetSchemaValidator";

const asyncSchema = { $async: true, type: "string" };

describe("dataset schema validation", () => {
  it("rejects asynchronous schemas when configuring a dataset", () => {
    expect(DatasetJSONSchema.safeParse(asyncSchema).success).toBe(false);
  });

  it.each([{ type: "string" }, { $async: false, type: "string" }])(
    "accepts synchronous schemas: %j",
    (schema) => {
      expect(DatasetJSONSchema.safeParse(schema).success).toBe(true);
    },
  );

  it("reports errors for persisted asynchronous input and output schemas", () => {
    const validator = new DatasetSchemaValidator({
      inputSchema: asyncSchema,
      expectedOutputSchema: asyncSchema,
    });

    const result = validator.validateItem({
      input: "input",
      expectedOutput: "output",
    });

    expect(result).toMatchObject({
      isValid: false,
      inputErrors: [{ path: "/", keyword: "$async" }],
      expectedOutputErrors: [{ path: "/", keyword: "$async" }],
    });
  });

  it.each(["input", 123])(
    "rejects asynchronous schemas in one-off field validation: %j",
    (data) => {
      expect(
        validateFieldAgainstSchema({ data, schema: asyncSchema }),
      ).toMatchObject({
        isValid: false,
        errors: [{ path: "/", keyword: "$async" }],
      });
    },
  );

  it("validates synchronous input and output schemas", () => {
    const validator = new DatasetSchemaValidator({
      inputSchema: { type: "string" },
      expectedOutputSchema: { type: "number" },
    });

    expect(
      validator.validateItem({ input: "input", expectedOutput: 1 }),
    ).toEqual({ isValid: true });
    expect(
      validator.validateItem({ input: 123, expectedOutput: "output" }),
    ).toMatchObject({
      isValid: false,
      inputErrors: [{ keyword: "type" }],
      expectedOutputErrors: [{ keyword: "type" }],
    });
  });

  it("accepts items without configured schemas", () => {
    const validator = new DatasetSchemaValidator({});

    expect(
      validator.validateItem({ input: null, expectedOutput: undefined }),
    ).toEqual({ isValid: true });
  });
});
