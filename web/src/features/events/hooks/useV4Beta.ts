import useLocalStorage from "@/src/components/useLocalStorage";

/**
 * App-wide hook for the v4 beta toggle (events-based tracing and users).
 * State is persisted in localStorage under the key "v4BetaEnabled".
 */
export function useV4Beta() {
  const [isBetaEnabled, setIsBetaEnabled] = useLocalStorage<boolean>(
    "v4BetaEnabled",
    false,
  );

  return { isBetaEnabled, setBetaEnabled: setIsBetaEnabled };
}
