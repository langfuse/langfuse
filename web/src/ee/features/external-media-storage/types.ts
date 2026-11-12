import {
  BLOB_STORAGE_REGION_INVALID_MESSAGE,
  BLOB_STORAGE_REGION_REGEX,
  STORAGE_ROLE_ARN_INVALID_MESSAGE,
  STORAGE_ROLE_PREFIX_INVALID_MESSAGE,
  STORAGE_ROLE_PREFIX_REGEX,
  STORAGE_ROLE_ARN_REGEX,
} from "@langfuse/shared";
import { z } from "zod";

export const externalMediaStorageFormSchema = z
  .object({
    type: z.enum(["S3", "S3_COMPATIBLE"]),
    authType: z.enum(["ACCESS_KEYS", "ROLE_ARN"]).optional(),
    bucketName: z.string().trim().min(1, "Bucket name is required"),
    endpoint: z.url().optional().nullable(),
    region: z
      .string()
      .trim()
      .min(1, "Region is required")
      .regex(BLOB_STORAGE_REGION_REGEX, {
        message: BLOB_STORAGE_REGION_INVALID_MESSAGE,
      }),
    accessKeyId: z.string().trim().nullable().optional(),
    secretAccessKey: z.string().nullable().optional(),
    roleArn: z.string().trim().nullable().optional(),
    prefix: z
      .string()
      .trim()
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
    if (values.authType !== "ROLE_ARN") {
      if (!values.accessKeyId) {
        ctx.addIssue({
          code: "custom",
          path: ["accessKeyId"],
          message: "Access Key ID is required",
        });
      }
      return;
    }
    if (values.type !== "S3") {
      ctx.addIssue({
        code: "custom",
        path: ["authType"],
        message: "IAM role auth is only available for Amazon S3",
      });
    }
    if (values.region.toLowerCase() === "auto") {
      ctx.addIssue({
        code: "custom",
        path: ["region"],
        message: "IAM role auth requires the bucket's AWS region",
      });
    }
    if (!values.roleArn || !STORAGE_ROLE_ARN_REGEX.test(values.roleArn)) {
      ctx.addIssue({
        code: "custom",
        path: ["roleArn"],
        message: STORAGE_ROLE_ARN_INVALID_MESSAGE,
      });
    }
    if (values.prefix && !STORAGE_ROLE_PREFIX_REGEX.test(values.prefix)) {
      ctx.addIssue({
        code: "custom",
        path: ["prefix"],
        message: STORAGE_ROLE_PREFIX_INVALID_MESSAGE,
      });
    }
  });

export type ExternalMediaStorageFormValues = z.infer<
  typeof externalMediaStorageFormSchema
>;
