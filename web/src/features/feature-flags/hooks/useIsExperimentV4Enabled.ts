import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";

export default function useIsExperimentV4Enabled(): {
  isEnabled: boolean;
  isAdmin: boolean;
  isFeatureEnabledOnUser: boolean;
  isV4BetaEnabled: boolean;
} {
  const {
    canAccessExperiments,
    isAdmin,
    isFeatureEnabledOnUser,
    isV4BetaEnabled,
  } = useExperimentAccess();

  return {
    isEnabled: canAccessExperiments,
    isAdmin,
    isFeatureEnabledOnUser,
    isV4BetaEnabled,
  };
}
