import { z } from "zod";
import type { Dataset } from "../../db";
import { jsonSchemaNullable } from "../../utils/zod";
import {
  getJSONSchemaValidationError,
  type FieldValidationError,
} from "../../utils/jsonSchemaValidation";

/**
 * Schema for validating JSON Schema objects
 * Supports JSON Schema Draft 2020-12
 * Uses Ajv to validate that the input is a valid JSON Schema
 */
export const DatasetJSONSchema = z
  .record(z.string(), jsonSchemaNullable)
  .superRefine((schema, context) => {
    const error = getJSONSchemaValidationError(schema);
    if (error) {
      context.addIssue({ code: "custom", message: error });
    }
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
