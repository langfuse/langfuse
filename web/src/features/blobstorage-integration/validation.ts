import type { z } from "zod";

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
