import { getArnPartition } from "../../../domain/storage-role-auth";

// STS rejects inline session policies longer than this (plaintext, minified).
export const STORAGE_SESSION_POLICY_MAX_LENGTH = 2048;

/**
 * Inline session policy that narrows the assumed customer role to reading
 * objects under the configured prefix, regardless of what the role allows.
 */
export function buildStorageReadSessionPolicy({
  roleArn,
  bucketName,
  prefix,
  region,
}: {
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
  region: string;
}) {
  const partition = getArnPartition(roleArn);
  const bucketArn = `arn:${partition}:s3:::${bucketName}`;
  const objectArn = `${bucketArn}/${prefix ?? ""}*`;
  const dnsSuffix =
    partition === "aws-cn" ? "amazonaws.com.cn" : "amazonaws.com";

  return JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      { Effect: "Allow", Action: "s3:GetObject", Resource: objectArn },
      {
        Effect: "Allow",
        Action: "kms:Decrypt",
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
