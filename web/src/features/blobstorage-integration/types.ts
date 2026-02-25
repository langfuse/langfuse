import { z } from "zod/v4";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
  AnalyticsIntegrationExportSource,
} from "@langfuse/shared";

export const blobStorageIntegrationFormSchema = z
  .object({
    type: z.enum(BlobStorageIntegrationType),
    bucketName: z.string().min(1, { message: "Bucket name is required" }),
    endpoint: z.string().url().optional().nullable(),
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
    exportFrequency: z.enum(["hourly", "daily", "weekly"]),
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
    // Granular export controls (optional - overrides exportSource when provided)
    exportTraces: z.boolean().optional().nullable(),
    exportObservations: z.boolean().optional().nullable(),
    exportScores: z.boolean().optional().nullable(),
    exportEvents: z.boolean().optional().nullable(),
    // Tag filtering (optional - filter exports by trace tags)
    // Array of filter conditions, combined with AND logic
    tagFilters: z
      .array(
        z.object({
          operator: z.enum(["any of", "all of", "none of"]),
          tags: z.array(z.string()).min(1),
        }),
      )
      .default([]),
  })
  .refine(
    (data) => {
      // At least one export type must be true, unless all are null (legacy fallback)
      const hasTrue =
        data.exportTraces === true ||
        data.exportObservations === true ||
        data.exportScores === true ||
        data.exportEvents === true;
      const hasFalse =
        data.exportTraces === false ||
        data.exportObservations === false ||
        data.exportScores === false ||
        data.exportEvents === false;
      // Pass if has at least one true, or no explicit false (all null = legacy)
      return hasTrue || !hasFalse;
    },
    {
      message: "At least one data type must be selected for export",
      path: ["_exportValidation"],
    },
  );

export type BlobStorageIntegrationFormSchema = z.infer<
  typeof blobStorageIntegrationFormSchema
>;
