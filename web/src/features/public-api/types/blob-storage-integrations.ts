import { z } from "zod";
import {
  AnalyticsIntegrationExportSource,
  OBSERVATION_FIELD_GROUPS_FULL,
} from "@langfuse/shared";
import {
  validateAzureContainerName,
  validateExportFieldGroups,
  exportStartDateNotInFuture,
  EXPORT_START_DATE_FUTURE_ERROR,
} from "@/src/features/blobstorage-integration/validation";

/**
 * Enums
 */

export const BlobStorageIntegrationType = z.enum([
  "S3",
  "S3_COMPATIBLE",
  "AZURE_BLOB_STORAGE",
]);

export const BlobStorageIntegrationFileType = z.enum([
  "JSON",
  "CSV",
  "JSONL",
  "PARQUET",
]);

// Kept as a separate export for the response type. Now identical to the request
// enum since Parquet is generally available and settable via the API.
export const BlobStorageIntegrationFileTypeResponse = z.enum([
  "JSON",
  "CSV",
  "JSONL",
  "PARQUET",
]);

export const BlobStorageExportMode = z.enum([
  "FULL_HISTORY",
  "FROM_TODAY",
  "FROM_CUSTOM_DATE",
]);

/**
 * Public REST enum for the blob-storage export source. Intentionally distinct
 * from the internal `AnalyticsIntegrationExportSource` (Prisma): names here
 * mirror the labels users see in the UI rather than the legacy internal
 * identifiers. Maps to the internal enum via `toInternalExportSource` /
 * `toPublicExportSource`.
 */
export const BlobStorageExportSource = z.enum([
  "LEGACY_TRACES_OBSERVATIONS",
  "OBSERVATIONS_V2",
  "LEGACY_TRACES_AND_ENRICHED_OBSERVATIONS",
]);

const PUBLIC_TO_INTERNAL_EXPORT_SOURCE = {
  LEGACY_TRACES_OBSERVATIONS:
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS,
  OBSERVATIONS_V2: AnalyticsIntegrationExportSource.EVENTS,
  LEGACY_TRACES_AND_ENRICHED_OBSERVATIONS:
    AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS,
} as const satisfies Record<
  z.infer<typeof BlobStorageExportSource>,
  AnalyticsIntegrationExportSource
>;

const INTERNAL_TO_PUBLIC_EXPORT_SOURCE = {
  [AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS]:
    "LEGACY_TRACES_OBSERVATIONS",
  [AnalyticsIntegrationExportSource.EVENTS]: "OBSERVATIONS_V2",
  [AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS_EVENTS]:
    "LEGACY_TRACES_AND_ENRICHED_OBSERVATIONS",
} as const satisfies Record<
  AnalyticsIntegrationExportSource,
  z.infer<typeof BlobStorageExportSource>
>;

export const toInternalExportSource = (
  publicValue: z.infer<typeof BlobStorageExportSource>,
): AnalyticsIntegrationExportSource =>
  PUBLIC_TO_INTERNAL_EXPORT_SOURCE[publicValue];

export const toPublicExportSource = (
  internalValue: AnalyticsIntegrationExportSource,
): z.infer<typeof BlobStorageExportSource> =>
  INTERNAL_TO_PUBLIC_EXPORT_SOURCE[internalValue];

export const BlobStorageExportFieldGroup = z.enum(
  OBSERVATION_FIELD_GROUPS_FULL,
);

/**
 * Request/Response Types
 */

export const CreateBlobStorageIntegrationRequest = z
  .object({
    projectId: z.string(),
    type: BlobStorageIntegrationType,
    bucketName: z.string().min(1),
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
    exportFrequency: z.enum(["every_20_minutes", "hourly", "daily", "weekly"]),
    enabled: z.boolean(),
    forcePathStyle: z.boolean(),
    fileType: BlobStorageIntegrationFileType,
    exportMode: BlobStorageExportMode,
    exportStartDate: z.coerce
      .date()
      .refine(exportStartDateNotInFuture, {
        message: EXPORT_START_DATE_FUTURE_ERROR,
      })
      .nullable()
      .optional(),
    compressed: z.boolean().optional().default(true),
    exportSource: BlobStorageExportSource.nullable().optional(),
    exportFieldGroups: z
      .array(BlobStorageExportFieldGroup)
      .nullable()
      .optional(),
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
  )
  .superRefine(validateAzureContainerName)
  .superRefine((data, ctx) => {
    if (data.exportSource == null && data.exportFieldGroups != null) {
      ctx.addIssue({
        code: "custom",
        message: "exportSource is required when exportFieldGroups is provided",
        path: ["exportSource"],
      });
      return;
    }
    if (data.exportFieldGroups != null && data.exportSource != null) {
      validateExportFieldGroups(
        { exportFieldGroups: data.exportFieldGroups },
        ctx,
      );
    }
  });

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
    fileType: BlobStorageIntegrationFileTypeResponse,
    exportMode: BlobStorageExportMode,
    exportStartDate: z.coerce.date().nullable(),
    compressed: z.boolean(),
    exportSource: BlobStorageExportSource,
    exportFieldGroups: z.array(BlobStorageExportFieldGroup).nullable(),
    nextSyncAt: z.coerce.date().nullable(),
    lastSyncAt: z.coerce.date().nullable(),
    lastError: z.string().nullable(),
    lastErrorAt: z.coerce.date().nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export type BlobStorageIntegrationResponseType = z.infer<
  typeof BlobStorageIntegrationResponse
>;

export const BlobStorageSyncStatus = z.enum([
  "idle",
  "running",
  "queued",
  "up_to_date",
  "disabled",
  "error",
]);

export const BlobStorageIntegrationStatusResponse = z
  .object({
    id: z.string(),
    projectId: z.string(),
    syncStatus: BlobStorageSyncStatus,
    enabled: z.boolean(),
    lastSyncAt: z.coerce.date().nullable(),
    nextSyncAt: z.coerce.date().nullable(),
    lastError: z.string().nullable(),
    lastErrorAt: z.coerce.date().nullable(),
  })
  .strict();

export type BlobStorageIntegrationStatusResponseType = z.infer<
  typeof BlobStorageIntegrationStatusResponse
>;
