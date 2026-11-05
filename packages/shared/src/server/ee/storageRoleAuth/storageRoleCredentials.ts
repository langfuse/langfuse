import { getArnPartition } from "../../../domain/storage-role-auth";
import { env } from "../../../env";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import {
  CustomerAccessRoleError,
  getCustomerRoleCredentialsProvider,
} from "../customerRoleAuth/customerRoleCredentials";

export function getStorageAccessRoleArn() {
  return env.LANGFUSE_CUSTOMER_STORAGE_ACCESS_ROLE_ARN || null;
}

// AWS does not allow AssumeRole across partitions (e.g. aws and aws-cn).
export function assertStorageRolePartition(roleArn: string) {
  const accessRoleArn = getStorageAccessRoleArn();
  if (
    accessRoleArn &&
    getArnPartition(roleArn) !== getArnPartition(accessRoleArn)
  ) {
    throw new InvalidRequestError(
      `The role must be in the ${getArnPartition(accessRoleArn)} AWS partition`,
    );
  }
}

/**
 * Customer role credentials for storage, chained through the storage access
 * role. A missing access role fails the credential fetch, not the client
 * construction, like any other credentials error.
 */
export function getStorageRoleCredentialsProvider(
  params: Omit<
    Parameters<typeof getCustomerRoleCredentialsProvider>[0],
    "accessRoleArn"
  >,
) {
  return async () => {
    const accessRoleArn = getStorageAccessRoleArn();
    if (!accessRoleArn) {
      throw new CustomerAccessRoleError(
        "IAM role auth is not available: LANGFUSE_CUSTOMER_STORAGE_ACCESS_ROLE_ARN is not set",
      );
    }
    return getCustomerRoleCredentialsProvider({ ...params, accessRoleArn })();
  };
}
