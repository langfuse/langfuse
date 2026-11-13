import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import { useExternalIdReveal } from "@/src/ee/features/storage-role-auth/useExternalIdReveal";
import { api } from "@/src/utils/api";

export function useBlobStorageExternalId(
  projectId: string,
  isSet: boolean,
): RevealableExternalId {
  const reveal = useExternalIdReveal(isSet);
  const query = api.blobStorageIntegration.getExternalId.useQuery(
    { projectId },
    { enabled: reveal.enabled },
  );
  return reveal.toRevealable(query);
}
