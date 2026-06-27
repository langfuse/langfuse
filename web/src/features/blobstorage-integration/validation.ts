import type { z } from "zod";

// 27h covers all real-world TZ offsets (UTC-12 to UTC+14 = 26h span + 1h margin).
// The HTML date picker sends YYYY-MM-DD parsed as UTC midnight; on a UTC server,
// an east-of-UTC user's local today can be up to 14h ahead of server UTC.
export const MAX_EXPORT_START_DATE_FUTURE_MS = 27 * 60 * 60 * 1000;

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

/**
 * Azure container names must be 3-63 characters, lowercase letters, numbers,
 * and hyphens only. Must start and end with a letter or number. No consecutive
 * hyphens.
 *
 * @see https://learn.microsoft.com/en-us/rest/api/storageservices/naming-and-referencing-containers--blobs--and-metadata#container-names
 */
export const AZURE_CONTAINER_NAME_REGEX =
  /^[a-z0-9](?!.*--)[a-z0-9-]{1,61}[a-z0-9]$/;

export const AZURE_CONTAINER_NAME_ERROR =
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
