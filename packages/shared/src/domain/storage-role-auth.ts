// Client-safe contracts for IAM role auth on customer-owned S3 buckets.

// Other partitions (ISO, EU sovereign cloud) use different S3 DNS suffixes,
// which the session policy's kms:ViaService condition does not cover.
export const STORAGE_ROLE_ARN_REGEX =
  /^arn:aws(?:-cn|-us-gov)?:iam::\d{12}:role\/[\w+=,.@/-]{1,512}$/;

export const STORAGE_ROLE_ARN_INVALID_MESSAGE =
  "Role ARN must look like arn:aws:iam::123456789012:role/role-name, in the aws, aws-cn or aws-us-gov partition";

// IAM reads `*`, `?` and `$` in a resource as wildcards or variables, so a
// prefix that contains them would widen the session policy. A leading "/" or
// a "//" would make the policy disagree with the app's key check.
export const STORAGE_ROLE_PREFIX_REGEX = /^(?!\/)(?!.*\/\/)[^*?$]*$/;

export const STORAGE_ROLE_PREFIX_INVALID_MESSAGE =
  'With IAM role auth, the prefix cannot start with "/" or contain "//", "*", "?" or "$"';

export function getArnPartition(arn: string) {
  return arn.split(":")[1] || "aws";
}

/**
 * Trust policy the customer attaches to their role so the Langfuse
 * cross-account role can assume it with the integration's external ID.
 */
export function buildStorageRoleTrustPolicy({
  crossAccountRoleArn,
  externalId,
}: {
  crossAccountRoleArn: string;
  externalId: string;
}) {
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { AWS: crossAccountRoleArn },
        Action: "sts:AssumeRole",
        Condition: { StringEquals: { "sts:ExternalId": externalId } },
      },
      {
        Effect: "Allow",
        Principal: { AWS: crossAccountRoleArn },
        Action: ["sts:TagSession", "sts:SetSourceIdentity"],
      },
    ],
  };
}

/**
 * Minimal permissions the customer role needs to let Langfuse read objects.
 */
export function buildStorageRoleReadPermissionPolicy({
  roleArn,
  bucketName,
  prefix,
}: {
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
}) {
  const partition = getArnPartition(roleArn);
  return {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "s3:GetObject",
        Resource: `arn:${partition}:s3:::${bucketName}/${prefix ?? ""}*`,
      },
    ],
  };
}
