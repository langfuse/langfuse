import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  BLOB_STORAGE_REGION_REGEX,
} from "@langfuse/shared";
import { z } from "zod";

export const externalMediaStorageFormSchema = z
  .object({
    type: z.enum(["S3", "S3_COMPATIBLE"]),
    bucketName: z.string().trim().min(1, "Bucket name is required"),
    endpoint: z.url().optional().nullable(),
    region: z
      .string()
      .trim()
      .min(1, "Region is required")
      .regex(BLOB_STORAGE_REGION_REGEX, {
        message: BLOB_STORAGE_REGION_INVALID_MESSAGE,
      }),
    accessKeyId: z.string().trim().min(1, "Access Key ID is required"),
    secretAccessKey: z.string().nullable().optional(),
    prefix: z
      .string()
      .refine((value) => !value || value.endsWith("/"), {
        message: "Prefix must end with a forward slash (/)",
      })
      .optional()
      .or(z.literal("")),
    forcePathStyle: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.type === "S3_COMPATIBLE" && !values.endpoint) {
      ctx.addIssue({
        code: "custom",
        path: ["endpoint"],
        message: "Endpoint URL is required for S3-compatible storage",
      });
    }
  });

export type ExternalMediaStorageFormValues = z.infer<
  typeof externalMediaStorageFormSchema
>;
