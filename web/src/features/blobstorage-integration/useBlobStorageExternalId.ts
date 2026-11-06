import { useState } from "react";

import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";
import { api } from "@/src/utils/api";

export function useBlobStorageExternalId(
  projectId: string,
  isSet: boolean,
): RevealableExternalId {
  const [isRevealed, setIsRevealed] = useState(false);
  if (!isSet && isRevealed) {
    setIsRevealed(false);
  }
  const query = api.blobStorageIntegration.getExternalId.useQuery(
    { projectId },
    { enabled: isRevealed && isSet },
  );

  return {
    isSet,
    value:
      isRevealed && isSet && !query.isFetching
        ? (query.data ?? undefined)
        : undefined,
    isLoading: query.isFetching,
    reveal: () => setIsRevealed(true),
  };
}
