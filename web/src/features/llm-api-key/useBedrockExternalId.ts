import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import { useExternalIdReveal } from "@/src/ee/features/storage-role-auth/useExternalIdReveal";
import type { LlmConnectionFormOwner } from "@/src/features/public-api/components/CreateLLMApiKeyForm";
import { api } from "@/src/utils/api";

export function useBedrockExternalId({
  owner,
  nonce,
  connectionId,
}: {
  owner: LlmConnectionFormOwner;
  nonce: string;
  connectionId?: string;
}): RevealableExternalId {
  const reveal = useExternalIdReveal(true);
  const projectQuery = api.llmApiKey.bedrockExternalId.useQuery(
    {
      projectId: owner.scope === "project" ? owner.projectId : "",
      nonce,
      connectionId,
    },
    {
      enabled: reveal.enabled && owner.scope === "project",
      select: (data) => data.externalId,
    },
  );
  const organizationQuery =
    api.organizationLlmApiKey.bedrockExternalId.useQuery(
      {
        orgId: owner.scope === "organization" ? owner.organizationId : "",
        nonce,
        connectionId,
      },
      {
        enabled: reveal.enabled && owner.scope === "organization",
        select: (data) => data.externalId,
      },
    );
  return reveal.toRevealable(
    owner.scope === "project" ? projectQuery : organizationQuery,
  );
}
