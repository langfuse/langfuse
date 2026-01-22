import { useEffect } from "react";
import { useRouter } from "next/router";
import useLocalStorage from "@/src/components/useLocalStorage";

export function useObservationListBeta() {
  const router = useRouter();
  const [isBetaEnabled, setIsBetaEnabled] = useLocalStorage<boolean>(
    "observationListBetaEnabled",
    false,
  );

  // Clear hasParentObservation filter whenever beta is OFF
  useEffect(() => {
    if (isBetaEnabled || !router.isReady) return;
    const filter = router.query.filter as string | undefined;
    if (!filter?.includes("hasParentObservation")) return;

    const cleaned = filter
      .split(",")
      .filter((s) => !s.startsWith("hasParentObservation"));
    void router.replace(
      {
        pathname: router.pathname,
        query: {
          ...router.query,
          filter: cleaned.length ? cleaned.join(",") : undefined,
        },
      },
      undefined,
      { shallow: true },
    );
  }, [isBetaEnabled, router.isReady]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isBetaEnabled, setBetaEnabled: setIsBetaEnabled };
}
