import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";

export function useExperimentAccess() {
  const { isBetaEnabled: isV4BetaEnabled, isInitializing } = useV4Beta();

  return {
    canAccessExperiments: isV4BetaEnabled,
    canSeeExperimentsNav: isV4BetaEnabled,
    // Experiments beta now follows the v4 / fast-preview beta flag directly.
    // There is no separate opt-in toggle anymore.
    isExperimentsBetaActive: isV4BetaEnabled,
    isInitializing,
    isV4BetaEnabled,
  };
}
