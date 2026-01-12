import { useCallback } from "react";
import { useRouter } from "next/router";
import useLocalStorage from "@/src/components/useLocalStorage";

export function useObservationListBeta() {
  const router = useRouter();
  const [isBetaEnabled, setIsBetaEnabled] = useLocalStorage<boolean>(
    "observationListBetaEnabled",
    false,
  );

  const setBetaEnabled = useCallback(
    (enabled: boolean) => {
      if (!enabled) {
        // Clear hasParentObservation filter when disabling beta
        const currentFilter = router.query.filter as string | undefined;
        if (currentFilter?.includes("hasParentObservation")) {
          const segments = currentFilter.split(",");
          const cleaned = segments.filter(
            (s) => !s.startsWith("hasParentObservation"),
          );
          const newQuery = { ...router.query };
          if (cleaned.length > 0) {
            newQuery.filter = cleaned.join(",");
          } else {
            delete newQuery.filter;
          }
          void router.replace(
            { pathname: router.pathname, query: newQuery },
            undefined,
            { shallow: true },
          );
        }
      }
      setIsBetaEnabled(enabled);
    },
    [router, setIsBetaEnabled],
  );

  return { isBetaEnabled, setBetaEnabled };
}
