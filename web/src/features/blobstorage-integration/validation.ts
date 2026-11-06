import type { z } from "zod";
import {
  BlobStorageIntegrationType,
  STORAGE_ROLE_ARN_INVALID_MESSAGE,
  STORAGE_ROLE_ARN_REGEX,
  STORAGE_ROLE_PREFIX_INVALID_MESSAGE,
  STORAGE_ROLE_PREFIX_REGEX,
  StorageIntegrationAuthType,
} from "@langfuse/shared";

// 27h covers all real-world TZ offsets (UTC-12 to UTC+14 = 26h span + 1h margin).
// The HTML date picker sends YYYY-MM-DD parsed as UTC midnight; on a UTC server,
// an east-of-UTC user's local today can be up to 14h ahead of server UTC.
const MAX_EXPORT_START_DATE_FUTURE_MS = 27 * 60 * 60 * 1000;

export function exportStartDateNotInFuture(d: Date | null | undefined) {
  return !d || d.getTime() <= Date.now() + MAX_EXPORT_START_DATE_FUTURE_MS;
}

export const EXPORT_START_DATE_FUTURE_ERROR =
  "Export start date must not be in the future (27 h tolerance for timezone differences)";

export function validateExportFieldGroups(
  data: { exportFieldGroups: unknown[] },
  ctx: z.RefinementCtx,
) {
  // Field groups apply to all export sources (legacy observations honor them
  // too), so core is required regardless of the selected source.
  if (!data.exportFieldGroups.includes("core")) {
    ctx.addIssue({
      code: "custom",
      message: "The Core field group is required",
      path: ["exportFieldGroups"],
    });
  }
}

export function validateRoleAuth(
  data: {
    type: string;
    region: string;
    authType?: string;
    roleArn?: string | null;
    prefix?: string;
  },
  ctx: z.RefinementCtx,
) {
  if (data.authType !== StorageIntegrationAuthType.ROLE_ARN) return;
  if (data.type !== BlobStorageIntegrationType.S3) {
    ctx.addIssue({
      code: "custom",
      message: "IAM role auth is only available for Amazon S3",
      path: ["authType"],
    });
  }
  if (data.region.trim().toLowerCase() === "auto") {
    ctx.addIssue({
      code: "custom",
      message: "IAM role auth requires the bucket's AWS region",
      path: ["region"],
    });
  }
  if (!STORAGE_ROLE_ARN_REGEX.test(data.roleArn?.trim() ?? "")) {
    ctx.addIssue({
      code: "custom",
      message: STORAGE_ROLE_ARN_INVALID_MESSAGE,
      path: ["roleArn"],
    });
  }
  if (data.prefix && !STORAGE_ROLE_PREFIX_REGEX.test(data.prefix)) {
    ctx.addIssue({
      code: "custom",
      message: STORAGE_ROLE_PREFIX_INVALID_MESSAGE,
      path: ["prefix"],
    });
  }
}

/**
 * Azure container names must be 3-63 characters, lowercase letters, numbers,
 * and hyphens only. Must start and end with a letter or number. No consecutive
 * hyphens.
 *
 * @see https://learn.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata#container-names
 */
export const AZURE_CONTAINER_NAME_REGEX =
  /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/;

const AZURE_CONTAINER_NAME_ERROR =
  "Azure container names must be 3-63 characters, lowercase letters, numbers, and hyphens only. Must start and end with a letter or number, no consecutive hyphens.";

export function validateAzureContainerName(
  data: { type: string; bucketName: string },
  ctx: z.RefinementCtx,
) {
  if (!data.bucketName) return;
  if (
    data.type === "AZURE_BLOB_STORAGE" &&
    !AZURE_CONTAINER_NAME_REGEX.test(data.bucketName)
  ) {
    ctx.addIssue({
      code: "custom",
      message: AZURE_CONTAINER_NAME_ERROR,
      path: ["bucketName"],
    });
  }
}
