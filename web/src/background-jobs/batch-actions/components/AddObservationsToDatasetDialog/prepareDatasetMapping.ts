import {
  applyFieldMappingConfig,
  FieldMappingConfigSchema,
  validateFieldAgainstSchema,
} from "@langfuse/shared";
import type {
  DatasetInfo,
  FieldMappingConfig,
  MappingConfig,
  ObservationPreviewData,
  PreparedMappingField,
} from "./types";
import {
  extractSchemaFields,
  generateEntriesFromSchema,
} from "./utils/extractSchemaFields";

export function createDatasetMapping(
  dataset: DatasetInfo | null,
): MappingConfig {
  function field(
    schema: unknown,
    source: "input" | "output",
  ): FieldMappingConfig {
    const entries = generateEntriesFromSchema(
      extractSchemaFields(schema),
      source,
    );
    return entries.length
      ? {
          mode: "custom",
          custom: { type: "keyValueMap", keyValueMapConfig: { entries } },
        }
      : { mode: "full" };
  }
  return {
    input: field(dataset?.inputSchema, "input"),
    expectedOutput: field(dataset?.expectedOutputSchema, "output"),
    metadata: { mode: "none" },
  };
}

export function prepareDatasetMapping(
  mapping: MappingConfig,
  observation: ObservationPreviewData | null,
  dataset: DatasetInfo | null,
): PreparedMappingField[] {
  const fields = [
    {
      key: "input",
      label: "Input",
      sourceField: "input",
      schema: dataset?.inputSchema,
    },
    {
      key: "expectedOutput",
      label: "Expected output",
      sourceField: "output",
      schema: dataset?.expectedOutputSchema,
    },
    {
      key: "metadata",
      label: "Metadata",
      sourceField: "metadata",
      schema: null,
    },
  ] as const;
  return fields.map((field) => {
    const config = mapping[field.key];
    const errors: string[] = [];
    const warnings: string[] = [];
    const parsed = FieldMappingConfigSchema.safeParse(config);
    if (!parsed.success)
      errors.push(...parsed.error.issues.map((issue) => issue.message));
    const result = applyFieldMappingConfig({
      observation: observation ?? { input: null, output: null, metadata: null },
      config,
      defaultSourceField: field.sourceField,
    });
    errors.push(
      ...result.errors.map(
        (error) => `Invalid JSONPath “${error.jsonPath}”: ${error.message}`,
      ),
    );
    if (observation) {
      warnings.push(
        ...result.misses.map(
          (miss) =>
            `“${miss.jsonPath}” did not match this observation. Items without a matching value will be skipped.`,
        ),
      );
      if (
        field.schema &&
        config.mode !== "none" &&
        !result.errors.length &&
        !result.misses.length
      ) {
        try {
          const validation = validateFieldAgainstSchema({
            data: result.value,
            schema: field.schema as Record<string, unknown>,
          });
          if (!validation.isValid)
            errors.push(
              ...validation.errors.map(
                (error) => `${error.path || "Value"}: ${error.message}`,
              ),
            );
        } catch {
          errors.push("The dataset schema could not be validated.");
        }
      }
    }
    return {
      ...field,
      value: observation ? result.value : undefined,
      errors,
      warnings,
    };
  });
}
