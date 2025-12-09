import z from "zod/v4";

export const FieldMappingSchema = z.object({
  sourceField: z.enum(["input", "output", "metadata"]),
  jsonPath: z.string().optional(), // Empty = entire field
  targetKey: z.string().optional(), // Key name for object construction
});

export const AddToDatasetMappingSchema = z.object({
  inputMappings: z.array(FieldMappingSchema).min(1),
  expectedOutputMappings: z.array(FieldMappingSchema).optional(),
  metadataMappings: z.array(FieldMappingSchema).optional(),
});

export const ObservationAddToDatasetConfigSchema = z.object({
  datasetId: z.string(),
  datasetName: z.string(),
  mapping: AddToDatasetMappingSchema,
});

export type FieldMapping = z.infer<typeof FieldMappingSchema>;
export type AddToDatasetMapping = z.infer<typeof AddToDatasetMappingSchema>;
export type ObservationAddToDatasetConfig = z.infer<
  typeof ObservationAddToDatasetConfigSchema
>;
