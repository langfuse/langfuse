import useLocalStorage from "@/src/components/useLocalStorage";

export function useObservationListBeta() {
  const [isBetaEnabled, setIsBetaEnabled] = useLocalStorage<boolean>(
    "observationListBetaEnabled",
    false,
  );

  return { isBetaEnabled, setBetaEnabled: setIsBetaEnabled };
}
