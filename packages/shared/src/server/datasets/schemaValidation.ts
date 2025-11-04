import Ajv, { AnySchema } from "ajv";
import addFormats from "ajv-formats";
import type { PrismaClient } from "../../db";

/**
 * Creates a fresh Ajv instance for validation
 * Using a fresh instance for each validation prevents memory leaks from cached compiled schemas
 */
const createAjvInstance = () => {
  const ajv = new Ajv({
    strict: false,
    allErrors: true, // Return all errors, not just first
    verbose: true,
  });
  addFormats(ajv);

  return ajv;
};

/**
 * Validates if a given object is a valid JSON Schema
 * Used by Zod schema validation
 */
export function isValidJSONSchema(schema: unknown) {
  try {
    const ajv = createAjvInstance();
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
 * Creates a fresh Ajv instance for each validation to prevent memory leaks
 */
export function validateDatasetItemField(params: {
  data: unknown;
  schema: Record<string, unknown>;
  itemId: string;
  field: "input" | "expectedOutput";
}): FieldValidationResult {
  const { data, schema } = params;
  const ajv = createAjvInstance();
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
 *
 * Uses batched validation with early exit for memory efficiency and fast feedback:
 * - Processes items in batches of 5000 to avoid memory issues
 * - Stops after collecting 10 validation errors (enough for debugging)
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

  const BATCH_SIZE = 5_000;
  const MAX_ERRORS = 10;

  let offset = 0;
  const errors: ValidationError[] = [];

  while (errors.length < MAX_ERRORS) {
    // Fetch batch
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
      skip: offset,
      take: BATCH_SIZE,
      orderBy: { id: "asc" }, // Consistent ordering for pagination
    });

    // No more items
    if (items.length === 0) break;

    // Validate batch
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
          if (errors.length >= MAX_ERRORS) break;
        }
      }

      // Validate expected output if schema exists (validate even if value is null)
      if (expectedOutputSchema && errors.length < MAX_ERRORS) {
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
          if (errors.length >= MAX_ERRORS) break;
        }
      }

      // Early exit if we have enough errors
      if (errors.length >= MAX_ERRORS) break;
    }

    // Move to next batch
    offset += BATCH_SIZE;

    // Last batch was incomplete - we've processed all items
    if (items.length < BATCH_SIZE) break;

    // Early exit if we have enough errors
    if (errors.length >= MAX_ERRORS) break;
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

export type ValidateItemResult =
  | { isValid: true }
  | {
      isValid: false;
      inputErrors?: FieldValidationError[];
      expectedOutputErrors?: FieldValidationError[];
    };

/**
 * Core validation logic - validates dataset item data
 * Works with already-parsed JSON (not strings)
 * Used by both tRPC and Public API
 *
 * @param normalizeUndefinedToNull - Set to true for CREATE operations where undefined becomes null in DB
 */
export function validateDatasetItemData(params: {
  input: unknown;
  expectedOutput: unknown;
  inputSchema: Record<string, unknown> | null | undefined;
  expectedOutputSchema: Record<string, unknown> | null | undefined;
  normalizeUndefinedToNull?: boolean;
}): ValidateItemResult {
  const errors: {
    inputErrors?: FieldValidationError[];
    expectedOutputErrors?: FieldValidationError[];
  } = {};

  // Validate input if schema exists
  if (params.inputSchema) {
    const valueToValidate = params.normalizeUndefinedToNull
      ? params.input === undefined || params.input === null
        ? null
        : params.input
      : params.input;

    const result = validateDatasetItemField({
      data: valueToValidate,
      schema: params.inputSchema,
      itemId: "validation",
      field: "input",
    });

    if (!result.isValid) {
      errors.inputErrors = result.errors;
    }
  }

  // Validate expected output if schema exists
  if (params.expectedOutputSchema) {
    const valueToValidate = params.normalizeUndefinedToNull
      ? params.expectedOutput === undefined || params.expectedOutput === null
        ? null
        : params.expectedOutput
      : params.expectedOutput;

    const result = validateDatasetItemField({
      data: valueToValidate,
      schema: params.expectedOutputSchema,
      itemId: "validation",
      field: "expectedOutput",
    });

    if (!result.isValid) {
      errors.expectedOutputErrors = result.errors;
    }
  }

  const isValid = !errors.inputErrors && !errors.expectedOutputErrors;

  return isValid ? { isValid: true } : { isValid: false, ...errors };
}
