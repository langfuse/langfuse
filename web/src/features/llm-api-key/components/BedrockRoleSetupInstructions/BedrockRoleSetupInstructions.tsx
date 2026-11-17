import { BEDROCK_ROLE_PERMISSION_POLICY } from "@langfuse/shared";

import { RoleAuthSetupInstructions } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupInstructions";
import { RoleAuthSetupSection } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupSection";
import { useExternalIdReveal } from "@/src/ee/features/storage-role-auth/useExternalIdReveal";
import { api } from "@/src/utils/api";

export function BedrockRoleSetupInstructions({
  projectId,
  crossAccountRoleArn,
}: {
  projectId: string;
  crossAccountRoleArn: string;
}) {
  // Langfuse generates the project's external ID when it is first shown.
  const externalIdReveal = useExternalIdReveal(true);
  const externalIdQuery = api.llmApiKey.bedrockExternalId.useQuery(
    { projectId },
    {
      enabled: externalIdReveal.enabled,
      select: (data) => data.externalId,
    },
  );

  return (
    <RoleAuthSetupSection>
      <RoleAuthSetupInstructions
        crossAccountRoleArn={crossAccountRoleArn}
        externalId={externalIdReveal.toRevealable(externalIdQuery)}
        permissionPolicy={BEDROCK_ROLE_PERMISSION_POLICY}
        description="Let the Langfuse cross-account role assume your role with this external ID, then allow the role to invoke Bedrock models. All Bedrock connections in this project use the same external ID."
      />
    </RoleAuthSetupSection>
  );
}
