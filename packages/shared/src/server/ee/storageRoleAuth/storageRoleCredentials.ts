import { getArnPartition } from "../../../domain/storage-role-auth";
import { env } from "../../../env";
import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import {
  CrossAccountRoleError,
  getCustomerRoleCredentialsProvider,
} from "../customerRoleAuth/customerRoleCredentials";

export function getCrossAccountRoleArn() {
  return env.LANGFUSE_CROSS_ACCOUNT_ROLE_ARN || null;
}

// AWS does not allow AssumeRole across partitions (e.g. aws and aws-cn).
export function assertStorageRolePartition(roleArn: string) {
  const crossAccountRoleArn = getCrossAccountRoleArn();
  if (
    crossAccountRoleArn &&
    getArnPartition(roleArn) !== getArnPartition(crossAccountRoleArn)
  ) {
    throw new InvalidRequestError(
      `The role must be in the ${getArnPartition(crossAccountRoleArn)} AWS partition`,
    );
  }
}

/**
 * Customer role credentials for storage, chained through the cross-account
 * role. A missing cross-account role fails the credential fetch, not the client
 * construction, like any other credentials error.
 */
export function getStorageRoleCredentialsProvider(
  params: Omit<
    Parameters<typeof getCustomerRoleCredentialsProvider>[0],
    "crossAccountRoleArn"
  >,
) {
  return async () => {
    const crossAccountRoleArn = getCrossAccountRoleArn();
    if (!crossAccountRoleArn) {
      throw new CrossAccountRoleError(
        "IAM role auth is not available: LANGFUSE_CROSS_ACCOUNT_ROLE_ARN is not set",
      );
    }
    return getCustomerRoleCredentialsProvider({
      ...params,
      crossAccountRoleArn,
    })();
  };
}
