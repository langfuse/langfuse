import { BEDROCK_ROLE_PERMISSION_POLICY } from "@langfuse/shared";

import { RoleAuthSetupInstructions } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupInstructions";
import { RoleAuthSetupSection } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupSection";
import { useExternalIdReveal } from "@/src/ee/features/storage-role-auth/useExternalIdReveal";
import { api } from "@/src/utils/api";

export function BedrockRoleSetupInstructions({
  projectId,
  nonce,
  connectionId,
  crossAccountRoleArn,
}: {
  projectId: string;
  /** The form's nonce; saving the connection with it stores this external ID. */
  nonce: string;
  connectionId?: string;
  crossAccountRoleArn: string;
}) {
  const externalIdReveal = useExternalIdReveal(true);
  const externalIdQuery = api.llmApiKey.bedrockExternalId.useQuery(
    { projectId, nonce, connectionId },
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
        description="Let the Langfuse cross-account role assume your role with this external ID, then allow the role to invoke Bedrock models. The external ID belongs to this connection and stays the same when you change the role."
      />
    </RoleAuthSetupSection>
  );
}
