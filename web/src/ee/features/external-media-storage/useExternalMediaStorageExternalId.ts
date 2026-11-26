import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import { useExternalIdReveal } from "@/src/ee/features/storage-role-auth/useExternalIdReveal";
import { api } from "@/src/utils/api";

export function useExternalMediaStorageExternalId(
  projectId: string,
  isSet: boolean,
): RevealableExternalId {
  const reveal = useExternalIdReveal(isSet);
  const query = api.externalMediaStorage.getExternalId.useQuery(
    { projectId },
    { enabled: reveal.enabled },
  );
  return reveal.toRevealable(query);
}
