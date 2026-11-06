import { useState } from "react";

import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import { api } from "@/src/utils/api";

export function useExternalMediaStorageExternalId(
  projectId: string,
  isSet: boolean,
): RevealableExternalId {
  const [isRevealed, setIsRevealed] = useState(false);
  // A deleted integration's external ID must not stay revealed for the next one.
  if (!isSet && isRevealed) {
    setIsRevealed(false);
  }
  const query = api.externalMediaStorage.getExternalId.useQuery(
    { projectId },
    { enabled: isRevealed && isSet },
  );

  return {
    isSet,
    // Cached data can belong to a deleted integration until the refetch ends.
    value:
      isRevealed && isSet && !query.isFetching
        ? (query.data ?? undefined)
        : undefined,
    isLoading: query.isFetching,
    reveal: () => setIsRevealed(true),
  };
}
