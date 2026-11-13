import { decrypt } from "../../../encryption";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { getStorageRoleCredentialsProvider } from "./storageRoleCredentials";
import { buildStorageWriteSessionPolicy } from "./storageSessionPolicy";

/**
 * Credentials provider for a blob storage export that uses IAM role auth,
 * scoped to writing under the export prefix.
 */
export function createBlobStorageRoleCredentials({
  projectId,
  orgId,
  roleArn,
  externalId,
  bucketName,
  prefix,
  region,
}: {
  projectId: string;
  orgId: string;
  roleArn: string | null;
  externalId: string | null;
  bucketName: string;
  prefix: string;
  region: string;
}) {
  if (!roleArn || !externalId) {
    throw new InvalidRequestError("The IAM role is not configured");
  }
  return getStorageRoleCredentialsProvider({
    cacheKey: `blob-storage:${projectId}`,
    // Not updatedAt: the worker updates the row on every run.
    version: [roleArn, externalId, bucketName, prefix, region].join("|"),
    roleArn,
    externalId: decrypt(externalId),
    projectId,
    orgId,
    sessionPolicy: buildStorageWriteSessionPolicy({
      roleArn,
      bucketName,
      prefix,
      region,
    }),
  });
}
