import { z } from "zod/v4";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
  BlobStorageExportMode,
} from "@langfuse/shared";

// Base schema for blob storage integration without sensitive data
export const BlobStorageIntegrationV1Response = z
  .object({
    projectId: z.string(),
    type: z.enum(BlobStorageIntegrationType),
    bucketName: z.string(),
    endpoint: z.string().nullable(),
    region: z.string(),
    prefix: z.string(),
    exportFrequency: z.enum(["hourly", "daily", "weekly"]),
    enabled: z.boolean(),
    forcePathStyle: z.boolean(),
    fileType: z.enum(BlobStorageIntegrationFileType),
    accessKeyId: z.string().nullable(),
    exportMode: z.enum(BlobStorageExportMode),
    exportStartDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

// List response for getting all integrations
export const GetBlobStorageIntegrationsV1Response = z
  .object({
    data: z.array(BlobStorageIntegrationV1Response),
  })
  .strict();

// Unified request body for creating or updating integration (upsert)
export const UpsertBlobStorageIntegrationV1Body = z
  .object({
    type: z.enum(BlobStorageIntegrationType),
    bucketName: z.string().min(1, { message: "Bucket name is required" }),
    endpoint: z.string().url().optional().nullable(),
    region: z.string().default("auto"),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    prefix: z
      .string()
      .refine((value) => !value || value === "" || value.endsWith("/"), {
        message: "Prefix must end with a forward slash (/)",
      })
      .optional()
      .or(z.literal("")),
    exportFrequency: z.enum(["hourly", "daily", "weekly"]).default("daily"),
    enabled: z.boolean().default(true),
    forcePathStyle: z.boolean().default(false),
    fileType: z
      .enum(BlobStorageIntegrationFileType)
      .default(BlobStorageIntegrationFileType.JSONL),
    exportMode: z
      .enum(BlobStorageExportMode)
      .default(BlobStorageExportMode.FULL_HISTORY),
    exportStartDate: z.coerce.date().optional().nullable(),
  })
  .strict();

// Legacy schema aliases for backward compatibility - now both point to the same upsert schema
export const PostBlobStorageIntegrationV1Body =
  UpsertBlobStorageIntegrationV1Body;
export const PutBlobStorageIntegrationV1Body =
  UpsertBlobStorageIntegrationV1Body;

// Since BlobStorageIntegration uses projectId as primary key, we don't need a separate query schema
// The integration is identified by the authenticated project

// Transform function to convert database model to API response
export const transformBlobStorageIntegrationToAPIResponse = (integration: {
  projectId: string;
  type: string;
  bucketName: string;
  endpoint: string | null;
  region: string;
  prefix: string;
  exportFrequency: string;
  enabled: boolean;
  forcePathStyle: boolean;
  fileType: string;
  accessKeyId: string | null;
  exportMode: string;
  exportStartDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): z.infer<typeof BlobStorageIntegrationV1Response> => {
  return {
    projectId: integration.projectId,
    type: integration.type as (typeof BlobStorageIntegrationType)[keyof typeof BlobStorageIntegrationType],
    bucketName: integration.bucketName,
    endpoint: integration.endpoint,
    region: integration.region,
    prefix: integration.prefix,
    exportFrequency: integration.exportFrequency as
      | "hourly"
      | "daily"
      | "weekly",
    enabled: integration.enabled,
    forcePathStyle: integration.forcePathStyle,
    fileType:
      integration.fileType as (typeof BlobStorageIntegrationFileType)[keyof typeof BlobStorageIntegrationFileType],
    accessKeyId: integration.accessKeyId,
    exportMode:
      integration.exportMode as (typeof BlobStorageExportMode)[keyof typeof BlobStorageExportMode],
    exportStartDate: integration.exportStartDate
      ? integration.exportStartDate.toISOString()
      : null,
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
};

export type BlobStorageIntegrationV1Response = z.infer<
  typeof BlobStorageIntegrationV1Response
>;
export type GetBlobStorageIntegrationsV1Response = z.infer<
  typeof GetBlobStorageIntegrationsV1Response
>;
export type UpsertBlobStorageIntegrationV1Body = z.infer<
  typeof UpsertBlobStorageIntegrationV1Body
>;
// Legacy type aliases for backward compatibility
export type PostBlobStorageIntegrationV1Body =
  UpsertBlobStorageIntegrationV1Body;
export type PutBlobStorageIntegrationV1Body =
  UpsertBlobStorageIntegrationV1Body;
