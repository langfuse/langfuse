import { z } from "zod";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  AnalyticsIntegrationExportSource,
  BLOB_EXPORT_FIELD_GROUPS,
} from "@langfuse/shared";
import {
  validateAzureContainerName,
  validateExportFieldGroups,
} from "@/src/features/blobstorage-integration/validation";

export const blobStorageIntegrationFormSchemaBase = z.object({
  type: z.enum(BlobStorageIntegrationType),
  bucketName: z.string().min(1, { message: "Bucket name is required" }),
  endpoint: z.url().optional().nullable(),
  region: z.string().default("auto"),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().nullable().optional(),
  prefix: z
    .string()
    .refine((value) => !value || value === "" || value.endsWith("/"), {
      message: "Prefix must end with a forward slash (/)",
    })
    .optional()
    .or(z.literal("")),
  exportFrequency: z.enum(["every_20_minutes", "hourly", "daily", "weekly"]),
  enabled: z.boolean(),
  forcePathStyle: z.boolean(),
  fileType: z
    .enum(BlobStorageIntegrationFileType)
    .default(BlobStorageIntegrationFileType.JSONL),
  exportMode: z
    .enum(BlobStorageExportMode)
    .default(BlobStorageExportMode.FULL_HISTORY),
  exportStartDate: z.coerce.date().optional().nullable(),
  exportSource: z
    .enum(AnalyticsIntegrationExportSource)
    .default(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS),
  exportFieldGroups: z
    .array(z.enum(BLOB_EXPORT_FIELD_GROUPS))
    .default([...BLOB_EXPORT_FIELD_GROUPS]),
  compressed: z.boolean().default(true),
});

export const blobStorageIntegrationFormSchema =
  blobStorageIntegrationFormSchemaBase
    .superRefine(validateAzureContainerName)
    .superRefine(validateExportFieldGroups);

export type BlobStorageIntegrationFormSchema = z.infer<
  typeof blobStorageIntegrationFormSchema
>;

export type BlobStorageSyncStatus =
  | "idle"
  | "queued"
  | "up_to_date"
  | "disabled"
  | "error";
