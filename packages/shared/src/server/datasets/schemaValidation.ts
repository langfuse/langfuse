import Ajv, { AnySchema } from "ajv";
import addFormats from "ajv-formats";
import type { PrismaClient } from "../../db";

// JSON Schema Draft 2020-12
const ajv = new Ajv({
  strict: false,
  allErrors: true, // Return all errors, not just first
  verbose: true,
});
addFormats(ajv);

/**
 * Validates if a given object is a valid JSON Schema
 * Used by Zod schema validation
 */
export function isValidJSONSchema(schema: unknown) {
  try {
    // This will throw an error if the schema is invalid
    ajv.compile(schema as AnySchema);

    return true;
  } catch (e) {
    return false;
  }
}
export type FieldValidationError = {
  path: string;
  message: string;
  keyword?: string;
};

export type ValidationError = {
  datasetItemId: string;
  field: "input" | "expectedOutput";
  errors: FieldValidationError[];
};

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
};

export type FieldValidationResult =
  | {
      isValid: true;
    }
  | {
      isValid: false;
      errors: FieldValidationError[];
    };

/**
 * Validates a single dataset item field against a JSON schema
 */
export function validateDatasetItemField(params: {
  data: unknown;
  schema: Record<string, unknown>;
  itemId: string;
  field: "input" | "expectedOutput";
}): FieldValidationResult {
  const { data, schema } = params;
  const validate = ajv.compile(schema);
  const isValid = validate(data);

  if (!isValid && validate.errors) {
    return {
      isValid: false,
      errors: validate.errors.map((err) => ({
        path: err.instancePath || "/",
        message: err.message || "Validation failed",
        keyword: err.keyword,
      })),
    };
  }

  return { isValid: true };
}

/**
 * Validates all dataset items against dataset schemas
 * Used when adding or updating schemas on an existing dataset
 */
export async function validateAllDatasetItems(params: {
  datasetId: string;
  projectId: string;
  inputSchema: Record<string, unknown> | null;
  expectedOutputSchema: Record<string, unknown> | null;
  prisma: PrismaClient;
}): Promise<ValidationResult> {
  const { datasetId, projectId, inputSchema, expectedOutputSchema, prisma } =
    params;

  const items = await prisma.datasetItem.findMany({
    where: {
      datasetId,
      projectId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      input: true,
      expectedOutput: true,
    },
  });

  const errors: ValidationError[] = [];

  for (const item of items) {
    // Validate input if schema exists (validate even if value is null)
    if (inputSchema) {
      const result = validateDatasetItemField({
        data: item.input,
        schema: inputSchema,
        itemId: item.id,
        field: "input",
      });
      if (!result.isValid) {
        errors.push({
          datasetItemId: item.id,
          field: "input",
          errors: result.errors,
        });
      }
    }

    // Validate expected output if schema exists (validate even if value is null)
    if (expectedOutputSchema) {
      const result = validateDatasetItemField({
        data: item.expectedOutput,
        schema: expectedOutputSchema,
        itemId: item.id,
        field: "expectedOutput",
      });
      if (!result.isValid) {
        errors.push({
          datasetItemId: item.id,
          field: "expectedOutput",
          errors: result.errors,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a batch of dataset items (for bulk operations like CSV upload)
 */
export function validateDatasetItemsBatch(params: {
  items: Array<{ id: string; input: unknown; expectedOutput: unknown }>;
  inputSchema: Record<string, unknown> | null;
  expectedOutputSchema: Record<string, unknown> | null;
}): ValidationResult {
  const { items, inputSchema, expectedOutputSchema } = params;
  const errors: ValidationError[] = [];

  for (const item of items) {
    // Validate input if schema exists (validate even if value is null/undefined)
    if (inputSchema) {
      // For CREATE operations, undefined becomes null in DB
      const valueToValidate =
        item.input === undefined || item.input === null ? null : item.input;

      const result = validateDatasetItemField({
        data: valueToValidate,
        schema: inputSchema,
        itemId: item.id,
        field: "input",
      });
      if (!result.isValid) {
        errors.push({
          datasetItemId: item.id,
          field: "input",
          errors: result.errors,
        });
      }
    }

    // Validate expected output if schema exists (validate even if value is null/undefined)
    if (expectedOutputSchema) {
      // For CREATE operations, undefined becomes null in DB
      const valueToValidate =
        item.expectedOutput === undefined || item.expectedOutput === null
          ? null
          : item.expectedOutput;

      const result = validateDatasetItemField({
        data: valueToValidate,
        schema: expectedOutputSchema,
        itemId: item.id,
        field: "expectedOutput",
      });
      if (!result.isValid) {
        errors.push({
          datasetItemId: item.id,
          field: "expectedOutput",
          errors: result.errors,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
