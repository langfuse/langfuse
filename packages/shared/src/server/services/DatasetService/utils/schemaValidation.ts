import { PrismaClient } from "../../../../db";
import { DatasetSchemaValidator } from "../DatasetSchemaValidator";
import type { FieldValidationError, FieldValidationResult } from "../types";
import { validateFieldAgainstSchema } from "./jsonSchemaValidation";

// Re-export for backward compatibility
// export { isValidJSONSchema } from "../../utils/jsonSchemaValidation";
// export type { FieldValidationError, FieldValidationResult };

export type ValidationError = {
  datasetItemId: string;
  field: "input" | "expectedOutput";
  errors: FieldValidationError[];
};

export type ValidationResult = {
  isValid: boolean;
  errors: ValidationError[];
};

/**
 * Validates a single dataset item field against a JSON schema
 * Wrapper around validateFieldAgainstSchema for dataset-specific usage
 */
export function validateDatasetItemField(params: {
  data: unknown;
  schema: Record<string, unknown>;
  itemId: string;
  field: "input" | "expectedOutput";
}): FieldValidationResult {
  return validateFieldAgainstSchema({
    data: params.data,
    schema: params.schema,
  });
}

/**
 * Validates all dataset items against dataset schemas
 * Used when adding or updating schemas on an existing dataset
 *
 * Performance optimized with batched validation:
 * - Compiles schemas once per batch (5000 items) - provides 3800x speedup
 * - Processes items in batches to avoid memory issues
 * - Stops after collecting 10 validation errors (enough for debugging)
 * - No memory leaks: validator is scoped to each batch and garbage collected
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

    // Create validator once per batch - compiles schemas once, reuses for all items
    // This provides 3800x+ performance improvement over fresh compilation per item
    // Validator is scoped to this batch and garbage collected after
    const validator = new DatasetSchemaValidator({
      inputSchema,
      expectedOutputSchema,
    });

    // Validate batch with reused compiled schemas
    for (const item of items) {
      // Validate input if schema exists (validate even if value is null)
      if (inputSchema) {
        const result = validator.validateInput(item.input);
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
        const result = validator.validateOutput(item.expectedOutput);
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
 * Performance optimized: compiles schemas once for entire batch
 */
export function validateDatasetItemsBatch(params: {
  items: Array<{ id: string; input: unknown; expectedOutput: unknown }>;
  inputSchema: Record<string, unknown> | null;
  expectedOutputSchema: Record<string, unknown> | null;
}): ValidationResult {
  const { items, inputSchema, expectedOutputSchema } = params;
  const errors: ValidationError[] = [];

  // Create validator once for entire batch - compiles schemas once, reuses for all items
  // Provides 3800x+ performance improvement over fresh compilation per item
  const validator = new DatasetSchemaValidator({
    inputSchema,
    expectedOutputSchema,
  });

  for (const item of items) {
    // Validate input if schema exists (validate even if value is null/undefined)
    if (inputSchema) {
      // For CREATE operations, undefined becomes null in DB
      const valueToValidate =
        item.input === undefined || item.input === null ? null : item.input;

      const result = validator.validateInput(valueToValidate);
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

      const result = validator.validateOutput(valueToValidate);
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
