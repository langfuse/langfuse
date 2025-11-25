import { useMemo } from "react";
import { validateFieldAgainstSchema } from "@langfuse/shared";
import type { Prisma } from "@langfuse/shared";

type Dataset = {
  id: string;
  name: string;
  inputSchema: Prisma.JsonValue | null;
  expectedOutputSchema: Prisma.JsonValue | null;
};

type DatasetError = {
  datasetId: string;
  datasetName: string;
  field: "input" | "expectedOutput";
  errors: Array<{
    path: string;
    message: string;
  }>;
};

type ValidationResult = {
  isValid: boolean;
  errors: DatasetError[];
  hasSchemas: boolean; // Indicates if any dataset has schemas
};

/**
 * Validates dataset item input and expectedOutput against multiple dataset schemas
 * @param inputString - JSON string of input data
 * @param expectedOutputString - JSON string of expected output data
 * @param datasets - Array of datasets with their schemas
 * @returns Validation result with errors grouped by dataset
 */
export const useDatasetItemValidation = (
  inputString: string,
  expectedOutputString: string,
  datasets: Dataset[],
): ValidationResult => {
  return useMemo(() => {
    const errors: DatasetError[] = [];
    let hasInputSchema = false;
    let hasOutputSchema = false;

    // Parse JSON strings once
    let inputData: unknown = null;
    let outputData: unknown = null;

    try {
      inputData = inputString ? JSON.parse(inputString) : null;
    } catch (e) {
      // Invalid JSON - skip validation (Zod will catch this)
      return { isValid: true, errors: [], hasSchemas: false };
    }

    try {
      outputData = expectedOutputString
        ? JSON.parse(expectedOutputString)
        : null;
    } catch (e) {
      // Invalid JSON - skip validation (Zod will catch this)
      return { isValid: true, errors: [], hasSchemas: false };
    }

    // Validate against each dataset's schemas
    for (const dataset of datasets) {
      // Validate input schema
      if (dataset.inputSchema) {
        hasInputSchema = true;
        const result = validateFieldAgainstSchema({
          data: inputData,
          schema: dataset.inputSchema as Record<string, unknown>,
        });

        if (!result.isValid) {
          errors.push({
            datasetId: dataset.id,
            datasetName: dataset.name,
            field: "input",
            errors: result.errors.map((err) => ({
              path: err.path,
              message: err.message,
            })),
          });
        }
      }

      // Validate expectedOutput schema
      if (dataset.expectedOutputSchema) {
        hasOutputSchema = true;
        const result = validateFieldAgainstSchema({
          data: outputData,
          schema: dataset.expectedOutputSchema as Record<string, unknown>,
        });

        if (!result.isValid) {
          errors.push({
            datasetId: dataset.id,
            datasetName: dataset.name,
            field: "expectedOutput",
            errors: result.errors.map((err) => ({
              path: err.path,
              message: err.message,
            })),
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      hasSchemas: hasInputSchema || hasOutputSchema,
    };
  }, [inputString, expectedOutputString, datasets]);
};
