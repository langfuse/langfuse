import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import { useExternalIdReveal } from "@/src/ee/features/storage-role-auth/useExternalIdReveal";
import { api } from "@/src/utils/api";

export function useBedrockExternalId({
  projectId,
  nonce,
  connectionId,
}: {
  projectId: string;
  nonce: string;
  connectionId?: string;
}): RevealableExternalId {
  const reveal = useExternalIdReveal(true);
  const query = api.llmApiKey.bedrockExternalId.useQuery(
    { projectId, nonce, connectionId },
    {
      enabled: reveal.enabled,
      select: (data) => data.externalId,
    },
  );
  return reveal.toRevealable(query);
}
