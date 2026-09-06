import { useReadPath } from "@/src/features/events/hooks/useReadPath";

export function useExperimentAccess() {
  const { isV4: isV4BetaEnabled, isResolved } = useReadPath();

  return {
    canAccessExperiments: isV4BetaEnabled,
    canSeeExperimentsNav: isV4BetaEnabled,
    // Experiments beta now follows the v4 / fast-preview beta flag directly.
    // There is no separate opt-in toggle anymore.
    isExperimentsBetaActive: isV4BetaEnabled,
    isInitializing: !isResolved,
    isV4BetaEnabled,
  };
}
