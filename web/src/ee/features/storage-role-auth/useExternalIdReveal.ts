import { useState } from "react";

import { type RevealableExternalId } from "@/src/ee/features/storage-role-auth/components/types";

type ExternalIdQuery = {
  data: string | null | undefined;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

/**
 * Reveal state for an external ID that is fetched on demand. Run the feature's
 * external ID query with `enabled`, then pass it to `toRevealable`.
 */
export function useExternalIdReveal(isSet: boolean) {
  const [isRevealed, setIsRevealed] = useState(false);
  // A deleted integration's external ID must not stay revealed for the next one.
  if (!isSet && isRevealed) {
    setIsRevealed(false);
  }

  return {
    enabled: isRevealed && isSet,
    toRevealable: (query: ExternalIdQuery): RevealableExternalId => ({
      isSet,
      value: isRevealed && isSet ? (query.data ?? undefined) : undefined,
      isLoading: query.isFetching,
      // After a failed load the ID is already revealed, so retry explicitly.
      reveal: () => {
        if (isRevealed) {
          query.refetch();
        } else {
          setIsRevealed(true);
        }
      },
    }),
  };
}
