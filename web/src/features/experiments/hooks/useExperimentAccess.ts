import { useSession } from "next-auth/react";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import useLocalStorage from "@/src/components/useLocalStorage";
import { getExperimentsAccess } from "@/src/features/experiments/utils/experimentsAccess";

const EXPERIMENTS_BETA_KEY_PREFIX = "experiments-beta-enabled";

function getStorageKey(prefix: string, userId?: string) {
  return `${prefix}:${userId ?? "anonymous"}`;
}

export function useExperimentAccess() {
  const { data: session } = useSession();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { isBetaEnabled: isV4BetaEnabled, canToggleV4 } = useV4Beta();

  const userId = session?.user?.id;

  // New users (canToggleV4 = false) get experiments beta auto-enabled
  // Only compute isNewCloudUser after session loads to avoid treating all users as "new" during loading
  const isNewCloudUser = isLangfuseCloud && !canToggleV4;

  const { isEnabled: canAccessExperiments } = getExperimentsAccess({
    isLangfuseCloud,
    isV4BetaEnabled,
  });

  const [isExperimentsBetaEnabled, setExperimentsBetaEnabled] =
    useLocalStorage<boolean>(
      getStorageKey(EXPERIMENTS_BETA_KEY_PREFIX, userId),
      false,
    );

  // For new cloud users, experiments beta is always enabled (bypass localStorage)
  const effectiveExperimentsBetaEnabled =
    isNewCloudUser || isExperimentsBetaEnabled;

  return {
    canAccessExperiments,
    // Hide toggle for new cloud users - they get experiments beta automatically
    canUseExperimentsBetaToggle: canAccessExperiments && !isNewCloudUser,
    canSeeExperimentsNav: canAccessExperiments,
    // New cloud users always have experiments beta active; others need localStorage toggle
    isExperimentsBetaActive:
      canAccessExperiments && effectiveExperimentsBetaEnabled,
    // Return effective value so pages render correctly for new users
    isExperimentsBetaEnabled: effectiveExperimentsBetaEnabled,
    setExperimentsBetaEnabled,
    isV4BetaEnabled,
  };
}
