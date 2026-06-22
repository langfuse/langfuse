import { z } from "zod";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  AnalyticsIntegrationExportSource,
  OBSERVATION_FIELD_GROUPS_FULL,
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
  exportStartDate: z.coerce
    .date()
    .refine(
      (d) => {
        if (!d) return true;
        // 27h tolerance covers all real-world TZ offsets (UTC-12 to UTC+14 = 26h span + 1h margin).
        // The HTML date picker sends YYYY-MM-DD parsed as UTC midnight; on a UTC server,
        // an east-of-UTC user's local today can be up to 14h ahead of server UTC.
        return d.getTime() <= Date.now() + 27 * 60 * 60 * 1000;
      },
      { message: "Export start date must be at most 24 hours in the future" },
    )
    .optional()
    .nullable(),
  exportSource: z
    .enum(AnalyticsIntegrationExportSource)
    .default(AnalyticsIntegrationExportSource.TRACES_OBSERVATIONS),
  exportFieldGroups: z
    .array(z.enum(OBSERVATION_FIELD_GROUPS_FULL))
    .default([...OBSERVATION_FIELD_GROUPS_FULL]),
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
  | "running"
  | "queued"
  | "up_to_date"
  | "disabled"
  | "error";
