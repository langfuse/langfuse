import { z } from "zod/v4";
import { jsonSchemaNullable } from "../../utils/zod";
import { isValidJSONSchema } from "../../utils/jsonSchemaValidation";

/**
 * Schema for validating JSON Schema objects
 * Supports JSON Schema Draft 2020-12
 * Uses Ajv to validate that the input is a valid JSON Schema
 */
export const DatasetJSONSchema = z
  .record(z.string(), jsonSchemaNullable)
  .refine(isValidJSONSchema, {
    message: "Must be a valid JSON Schema",
  });

export type DatasetJSONSchema = z.infer<typeof DatasetJSONSchema>;
