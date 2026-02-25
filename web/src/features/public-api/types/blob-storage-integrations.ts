import { z } from "zod/v4";

/**
 * Enums
 */

export const BlobStorageIntegrationType = z.enum([
  "S3",
  "S3_COMPATIBLE",
  "AZURE_BLOB_STORAGE",
]);

export const BlobStorageIntegrationFileType = z.enum(["JSON", "CSV", "JSONL"]);

export const BlobStorageExportMode = z.enum([
  "FULL_HISTORY",
  "FROM_TODAY",
  "FROM_CUSTOM_DATE",
]);

export const BlobStorageFilterTagsOperator = z.enum([
  "any of",
  "all of",
  "none of",
]);

// Tag filter condition schema
export const BlobStorageTagFilterCondition = z.object({
  operator: BlobStorageFilterTagsOperator,
  tags: z.array(z.string()).min(1),
});

/**
 * Request/Response Types
 */

export const CreateBlobStorageIntegrationRequest = z
  .object({
    projectId: z.string(),
    type: BlobStorageIntegrationType,
    bucketName: z.string(),
    endpoint: z.string().nullable().optional(),
    region: z.string(),
    accessKeyId: z.string().nullable().optional(),
    secretAccessKey: z.string().nullable().optional(),
    prefix: z
      .string()
      .optional()
      .default("")
      .refine(
        (value) => value === "" || value.endsWith("/"),
        "Prefix must be empty or end with a forward slash",
      ),
    exportFrequency: z.string(),
    enabled: z.boolean(),
    forcePathStyle: z.boolean(),
    fileType: BlobStorageIntegrationFileType,
    exportMode: BlobStorageExportMode,
    exportStartDate: z.coerce.date().nullable().optional(),
    // Granular export controls (optional - overrides exportSource when provided)
    exportTraces: z.boolean().nullable().optional(),
    exportObservations: z.boolean().nullable().optional(),
    exportScores: z.boolean().nullable().optional(),
    exportEvents: z.boolean().nullable().optional(),
    // Tag filtering - array of filter conditions combined with AND logic
    tagFilters: z.array(BlobStorageTagFilterCondition).optional(),
  })
  .strict()
  .refine(
    (data) => {
      return !(data.exportMode === "FROM_CUSTOM_DATE" && !data.exportStartDate);
    },
    {
      message:
        "exportStartDate is required when exportMode is FROM_CUSTOM_DATE",
      path: ["exportStartDate"],
    },
  );

export const BlobStorageIntegrationResponse = z
  .object({
    id: z.string(),
    projectId: z.string(),
    type: BlobStorageIntegrationType,
    bucketName: z.string(),
    endpoint: z.string().nullable(),
    region: z.string(),
    accessKeyId: z.string().nullable(),
    prefix: z.string(),
    exportFrequency: z.string(),
    enabled: z.boolean(),
    forcePathStyle: z.boolean(),
    fileType: BlobStorageIntegrationFileType,
    exportMode: BlobStorageExportMode,
    exportStartDate: z.coerce.date().nullable(),
    nextSyncAt: z.coerce.date().nullable(),
    lastSyncAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    // Granular export controls
    exportTraces: z.boolean().nullable(),
    exportObservations: z.boolean().nullable(),
    exportScores: z.boolean().nullable(),
    exportEvents: z.boolean().nullable(),
    // Tag filtering - array of filter conditions combined with AND logic
    tagFilters: z.array(BlobStorageTagFilterCondition),
  })
  .strict();

export type BlobStorageIntegrationResponseType = z.infer<
  typeof BlobStorageIntegrationResponse
>;
