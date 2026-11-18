import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { api } from "@/src/utils/api";

function getUnavailableReason(params: {
  hasEntitlement: boolean;
  isProjectConnection: boolean;
  deploymentHasRole: boolean | undefined;
}): string | null {
  if (!params.hasEntitlement) {
    return "IAM role auth is available on the Enterprise plan. Upgrade to use it.";
  }
  if (!params.isProjectConnection) {
    return "IAM role auth is available for project connections, since each project gets its own external ID. Add this connection in the project settings.";
  }
  if (params.deploymentHasRole === false) {
    return "IAM role auth needs a cross-account role on this deployment. Set LANGFUSE_CROSS_ACCOUNT_ROLE_ARN to enable it.";
  }
  return null;
}

/**
 * Whether the connection form can offer IAM role auth for Bedrock. The option
 * is always shown; `unavailableReason` explains why it is disabled. While the
 * deployment's role is loading, the option is disabled without a reason.
 */
export function useBedrockIamRoleAuth({
  projectId,
  enabled,
}: {
  /** Null for organization connections, which cannot use a role. */
  projectId: string | null;
  enabled: boolean;
}) {
  const hasEntitlement = useHasEntitlement("bedrock-iam-role-auth");
  const query = api.llmApiKey.bedrockIamRoleAuth.useQuery(
    { projectId: projectId ?? "" },
    { enabled: enabled && hasEntitlement && projectId !== null },
  );
  const crossAccountRoleArn = query.data?.crossAccountRoleArn ?? null;

  return {
    crossAccountRoleArn,
    isAvailable: crossAccountRoleArn !== null,
    unavailableReason: getUnavailableReason({
      hasEntitlement,
      isProjectConnection: projectId !== null,
      deploymentHasRole: query.data ? crossAccountRoleArn !== null : undefined,
    }),
  };
}
