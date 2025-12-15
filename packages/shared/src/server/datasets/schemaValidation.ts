import { createDatasetItemFilterState, getDatasetItems } from "../repositories";
import { DatasetSchemaValidator } from "../services/DatasetService/DatasetSchemaValidator";
import type { DatasetSchemaValidationError } from "./schemaTypes";

// Re-export for backward compatibility with tests
export { isValidJSONSchema } from "../../utils/jsonSchemaValidation";

export type ValidationResult = {
  isValid: boolean;
  errors: DatasetSchemaValidationError[];
};

/**
 * Validates all existing dataset items against new/updated schemas.
 *
 * **When to use:**
 * - ONLY when adding or updating schemas on a dataset that already has items
 * - Called during dataset UPSERT operations to ensure existing items are compatible
 * - Used to block schema changes that would make existing data invalid
 *
 * **When NOT to use:**
 * - DO NOT use for validating new items during creation/update
 * - Use  dataset-items repository methods instead, which handle per-item validation
 *
 * **Performance:**
 * - Batched validation: processes 5000 items at a time
 * - Compiles schemas once per batch (3800x+ faster than per-item compilation)
 * - Stops after 10 errors (enough for user feedback without wasting resources)
 *
 * @example
 * // User tries to add schema to dataset with existing items
 * const result = await validateAllDatasetItems({
 *   datasetId, projectId, inputSchema, expectedOutputSchema
 * });
 * if (!result.isValid) {
 *   throw new Error(`Cannot add schema: ${result.errors.length} items fail validation`);
 * }
 */
export async function validateAllDatasetItems(params: {
  datasetId: string;
  projectId: string;
  inputSchema: Record<string, unknown> | null;
  expectedOutputSchema: Record<string, unknown> | null;
}): Promise<ValidationResult> {
  const { datasetId, projectId, inputSchema, expectedOutputSchema } = params;

  const BATCH_SIZE = 5_000;
  const MAX_ERRORS = 10;

  let page = 0;
  const errors: DatasetSchemaValidationError[] = [];

  while (errors.length < MAX_ERRORS) {
    // Fetch batch
    const items = await getDatasetItems({
      projectId,
      filterState: createDatasetItemFilterState({
        datasetIds: [datasetId],
      }),
      limit: BATCH_SIZE,
      page,
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
    page++;

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
