import { z } from "zod";
import { BlobStorageIntegrationType } from "@langfuse/shared";

export const blobStorageIntegrationFormSchema = z.object({
  type: z.nativeEnum(BlobStorageIntegrationType),
  bucketName: z.string().min(1, { message: "Bucket name is required" }),
  endpoint: z.string().url().optional().nullable(),
  region: z.string().default("auto"),
  accessKeyId: z.string().min(1, { message: "Access key ID is required" }),
  secretAccessKey: z
    .string()
    .min(1, { message: "Secret access key is required" })
    .nullable(), // Only required on create
  prefix: z.string().optional().or(z.literal("")),
  exportFrequency: z.enum(["hourly", "daily", "weekly"]),
  enabled: z.boolean(),
  forcePathStyle: z.boolean(),
});

export type BlobStorageIntegrationFormSchema = z.infer<
  typeof blobStorageIntegrationFormSchema
>;
