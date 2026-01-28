import useLocalStorage from "@/src/components/useLocalStorage";

export function useV4Beta() {
  const [isBetaEnabled, setIsBetaEnabled] = useLocalStorage<boolean>(
    "v4BetaEnabled",
    false,
  );

  return { isBetaEnabled, setBetaEnabled: setIsBetaEnabled };
}
