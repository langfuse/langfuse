import {
  buildStorageRolePermissionPolicy,
  type StorageRoleActions,
} from "@langfuse/shared";

/** The storage permission policy, with placeholders for fields not filled in yet. */
export function buildStorageRolePermissionPolicyPreview({
  roleArn,
  bucketName,
  prefix,
  actions,
}: {
  roleArn: string;
  bucketName: string;
  prefix: string | null | undefined;
  actions: StorageRoleActions;
}) {
  return buildStorageRolePermissionPolicy({
    roleArn: roleArn || "arn:aws:iam::123456789012:role/role-name",
    bucketName: bucketName || "bucket-name",
    prefix,
    actions,
  });
}
