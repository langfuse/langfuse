import { z } from "zod";

export const storageProviderEnum = z.enum(["s3", "s3-compatible", "azure"]);
export type StorageProvider = z.infer<typeof storageProviderEnum>;

export const blobStorageIntegrationFormSchema = z.object({
  provider: storageProviderEnum,
  bucketName: z.string().min(1, { message: "Bucket name is required" }),
  endpoint: z.string().url().optional().or(z.literal("")),
  region: z.string().optional().or(z.literal("")),
  accessKeyId: z.string().min(1, { message: "Access key ID is required" }),
  secretAccessKey: z.string().min(1, { message: "Secret access key is required" }),
  exportPrefix: z.string().optional().or(z.literal("")),
  exportFrequency: z.enum(["daily", "weekly", "monthly"]),
  enabled: z.boolean(),
  forcePathStyle: z.boolean().optional(),
});

export type BlobStorageIntegrationFormSchema = z.infer<typeof blobStorageIntegrationFormSchema>;