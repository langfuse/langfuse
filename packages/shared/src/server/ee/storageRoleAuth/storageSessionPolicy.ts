import {
  getArnPartition,
  STORAGE_ROLE_READ_ACTIONS,
  STORAGE_ROLE_WRITE_ACTIONS,
  type StorageRoleActions,
} from "../../../domain/storage-role-auth";

// STS rejects inline session policies longer than this (plaintext, minified).
export const STORAGE_SESSION_POLICY_MAX_LENGTH = 2048;

type SessionPolicyParams = {
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
  region: string;
};

function buildStorageSessionPolicy({
  roleArn,
  bucketName,
  prefix,
  region,
  actions,
}: SessionPolicyParams & { actions: StorageRoleActions }) {
  const partition = getArnPartition(roleArn);
  const bucketArn = `arn:${partition}:s3:::${bucketName}`;
  const objectArn = `${bucketArn}/${prefix ?? ""}*`;
  const dnsSuffix =
    partition === "aws-cn" ? "amazonaws.com.cn" : "amazonaws.com";

  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: actions.s3, Resource: objectArn },
      {
        Effect: "Allow",
        Action: actions.kms,
        Resource: "*",
        Condition: {
          StringEquals: { "kms:ViaService": `s3.${region}.${dnsSuffix}` },
          // Bucket ARN covers SSE-KMS with S3 Bucket Keys enabled.
          StringLike: {
            "kms:EncryptionContext:aws:s3:arn": [objectArn, bucketArn],
          },
        },
      },
    ],
  });
}

/**
 * Inline session policy that narrows the assumed customer role to reading
 * objects under the configured prefix, regardless of what the role allows.
 */
export function buildStorageReadSessionPolicy(params: SessionPolicyParams) {
  return buildStorageSessionPolicy({
    ...params,
    actions: STORAGE_ROLE_READ_ACTIONS,
  });
}

/**
 * Inline session policy that narrows the assumed customer role to writing
 * (and cleaning up) objects under the configured prefix.
 */
export function buildStorageWriteSessionPolicy(params: SessionPolicyParams) {
  return buildStorageSessionPolicy({
    ...params,
    actions: STORAGE_ROLE_WRITE_ACTIONS,
  });
}
