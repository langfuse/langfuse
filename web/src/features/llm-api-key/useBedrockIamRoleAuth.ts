import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import type { LlmConnectionFormOwner } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { api } from "@/src/utils/api";

function getUnavailableReason(params: {
  hasEntitlement: boolean;
  deploymentHasRole: boolean | undefined;
}): string | null {
  if (!params.hasEntitlement) {
    return "IAM role auth is available on the Enterprise plan. Upgrade to use it.";
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
  owner,
  enabled,
}: {
  owner: LlmConnectionFormOwner;
  enabled: boolean;
}) {
  const hasEntitlement = useHasEntitlement("bedrock-iam-role-auth");
  const shouldQuery = enabled && hasEntitlement;
  const projectQuery = api.llmApiKey.bedrockIamRoleAuth.useQuery(
    { projectId: owner.scope === "project" ? owner.projectId : "" },
    { enabled: shouldQuery && owner.scope === "project" },
  );
  const organizationQuery =
    api.organizationLlmApiKey.bedrockIamRoleAuth.useQuery(
      { orgId: owner.scope === "organization" ? owner.organizationId : "" },
      { enabled: shouldQuery && owner.scope === "organization" },
    );
  const data =
    owner.scope === "project" ? projectQuery.data : organizationQuery.data;
  const crossAccountRoleArn = data?.crossAccountRoleArn ?? null;

  return {
    crossAccountRoleArn,
    isAvailable: crossAccountRoleArn !== null,
    unavailableReason: getUnavailableReason({
      hasEntitlement,
      deploymentHasRole: data ? crossAccountRoleArn !== null : undefined,
    }),
  };
}
