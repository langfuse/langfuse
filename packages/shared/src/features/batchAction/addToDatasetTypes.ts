import z from "zod/v4";

// Source field type
export const SourceFieldSchema = z.enum(["input", "output", "metadata"]);

// Mapping mode for each field
export const MappingModeSchema = z.enum(["full", "custom", "none"]);

// Mapping target type: "root" extracts single value, "keyValueMap" builds an object
export const MappingTargetSchema = z.enum(["root", "keyValueMap"]);

// Root mapping config - single JSON path extraction
export const RootMappingConfigSchema = z.object({
  sourceField: SourceFieldSchema,
  jsonPath: z.string(),
});

// Key-value mapping entry - key-value pair for building objects
export const KeyValueMappingEntrySchema = z.object({
  id: z.string(),
  key: z.string().min(1, "Key is required"),
  sourceField: SourceFieldSchema,
  value: z.string(), // JSON path if starts with $, else literal string
});

// Custom mapping config - either root or key-value map type
export const CustomMappingConfigSchema = z.object({
  type: MappingTargetSchema,
  rootConfig: RootMappingConfigSchema.optional(),
  keyValueMapConfig: z
    .object({
      entries: z
        .array(KeyValueMappingEntrySchema)
        .min(1, "At least one entry is required"),
    })
    .optional(),
});

// Per-field mapping config
export const FieldMappingConfigSchema = z.object({
  mode: MappingModeSchema,
  custom: CustomMappingConfigSchema.optional(),
});

// Complete mapping config for all three fields
export const AddToDatasetMappingSchema = z.object({
  input: FieldMappingConfigSchema,
  expectedOutput: FieldMappingConfigSchema,
  metadata: FieldMappingConfigSchema,
});

// Config for the batch action
export const ObservationAddToDatasetConfigSchema = z.object({
  datasetId: z.string(),
  datasetName: z.string(),
  mapping: AddToDatasetMappingSchema,
});

// Type exports
export type SourceField = z.infer<typeof SourceFieldSchema>;
export type MappingMode = z.infer<typeof MappingModeSchema>;
export type MappingTarget = z.infer<typeof MappingTargetSchema>;
export type RootMappingConfig = z.infer<typeof RootMappingConfigSchema>;
export type KeyValueMappingEntry = z.infer<typeof KeyValueMappingEntrySchema>;
export type CustomMappingConfig = z.infer<typeof CustomMappingConfigSchema>;
export type FieldMappingConfig = z.infer<typeof FieldMappingConfigSchema>;
export type AddToDatasetMapping = z.infer<typeof AddToDatasetMappingSchema>;
export type ObservationAddToDatasetConfig = z.infer<
  typeof ObservationAddToDatasetConfigSchema
>;
