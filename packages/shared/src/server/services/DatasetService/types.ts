import { z } from "zod/v4";
import { ValidationError } from "ajv";
import { Dataset, DatasetStatus, Prisma } from "../../../db";
import { jsonSchemaNullable } from "../../../utils/zod";
import {
  FieldValidationError,
  isValidJSONSchema,
} from "../../../utils/jsonSchemaValidation";

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
      validationErrors: ValidationError[];
    };

export type PayloadError = {
  success: false;
  message: string;
  cause?: {
    inputErrors?: FieldValidationError[];
    expectedOutputErrors?: FieldValidationError[];
  };
};

export type PreparePayloadResult =
  | {
      success: true;
      input: Prisma.NullTypes.DbNull | Prisma.InputJsonObject | undefined;
      expectedOutput:
        | Prisma.NullTypes.DbNull
        | Prisma.InputJsonObject
        | undefined;
      metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonObject | undefined;
    }
  | PayloadError;

export type CreateManyItemsPayload = {
  datasetId: string;
  input?: string | null;
  expectedOutput?: string | null;
  metadata?: string | null;
  sourceTraceId?: string;
  sourceObservationId?: string;
}[];

export type CreateManyItemsInsert = {
  id: string;
  projectId: string;
  datasetId: string;
  status: DatasetStatus;
  input: Prisma.NullTypes.DbNull | Prisma.InputJsonObject | undefined;
  expectedOutput: Prisma.NullTypes.DbNull | Prisma.InputJsonObject | undefined;
  metadata: Prisma.NullTypes.DbNull | Prisma.InputJsonObject | undefined;
  sourceTraceId?: string;
  sourceObservationId?: string;
}[];

/**
 * Type for bulk dataset item validation errors
 * Used when validating multiple items before creation (e.g., CSV upload)
 */
export type CreateManyValidationError = {
  itemIndex: number;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
    keyword?: string;
  }>;
};
