import { BEDROCK_ROLE_PERMISSION_POLICY } from "@langfuse/shared";

import { RoleAuthSetupInstructions } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupInstructions";
import { RoleAuthSetupSection } from "@/src/ee/features/storage-role-auth/components/RoleAuthSetupSection";
import { useBedrockExternalId } from "@/src/features/llm-api-key/useBedrockExternalId";
import type { LlmConnectionFormOwner } from "@/src/features/public-api/components/CreateLLMApiKeyForm";

export function BedrockRoleSetupInstructions({
  owner,
  nonce,
  connectionId,
  crossAccountRoleArn,
}: {
  owner: LlmConnectionFormOwner;
  /** The form's nonce; saving the connection with it stores this external ID. */
  nonce: string;
  connectionId?: string;
  crossAccountRoleArn: string;
}) {
  const externalId = useBedrockExternalId({ owner, nonce, connectionId });

  return (
    <RoleAuthSetupSection>
      <RoleAuthSetupInstructions
        crossAccountRoleArn={crossAccountRoleArn}
        externalId={externalId}
        permissionPolicy={BEDROCK_ROLE_PERMISSION_POLICY}
        description="Let the Langfuse cross-account role assume your role with this external ID, then allow the role to invoke Bedrock models. The external ID belongs to this connection and stays the same when you change the role."
      />
    </RoleAuthSetupSection>
  );
}
