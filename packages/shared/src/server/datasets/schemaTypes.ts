import { z } from "zod/v4";
import type { Dataset } from "../../db";
import { jsonSchemaNullable } from "../../utils/zod";
import {
  isValidJSONSchema,
  type FieldValidationError,
} from "../../utils/jsonSchemaValidation";

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

/**
 * Validation error for dataset schema validation
 * Used when validating existing items against newly added/updated schemas
 */
export type DatasetSchemaValidationError = {
  datasetItemId: string;
  field: "input" | "expectedOutput";
  errors: FieldValidationError[];
};

/**
 * Result type for dataset mutations that may fail validation
 * Using discriminated union for type-safe error handling
 */
export type DatasetMutationResult =
  | {
      success: true;
      dataset: Dataset;
    }
  | {
      success: false;
      validationErrors: DatasetSchemaValidationError[];
    };
