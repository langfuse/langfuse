import { z } from "zod/v4";
import {
  BlobStorageIntegrationType,
  BlobStorageIntegrationFileType,
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

// Request body for creating a new integration
export const PostBlobStorageIntegrationV1Body = z
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
  })
  .strict();

// Request body for updating an integration
export const PutBlobStorageIntegrationV1Body = z
  .object({
    type: z.enum(BlobStorageIntegrationType).optional(),
    bucketName: z
      .string()
      .min(1, { message: "Bucket name is required" })
      .optional(),
    endpoint: z.string().url().optional().nullable(),
    region: z.string().optional(),
    accessKeyId: z.string().optional(),
    secretAccessKey: z.string().optional(),
    prefix: z
      .string()
      .refine((value) => !value || value === "" || value.endsWith("/"), {
        message: "Prefix must end with a forward slash (/)",
      })
      .optional()
      .or(z.literal("")),
    exportFrequency: z.enum(["hourly", "daily", "weekly"]).optional(),
    enabled: z.boolean().optional(),
    forcePathStyle: z.boolean().optional(),
    fileType: z.enum(BlobStorageIntegrationFileType).optional(),
  })
  .strict();

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
export type PostBlobStorageIntegrationV1Body = z.infer<
  typeof PostBlobStorageIntegrationV1Body
>;
export type PutBlobStorageIntegrationV1Body = z.infer<
  typeof PutBlobStorageIntegrationV1Body
>;
