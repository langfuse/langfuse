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
  const { isBetaEnabled: isV4BetaEnabled } = useV4Beta();

  const userId = session?.user?.id;
  const isAdmin = session?.user?.admin ?? false;
  const isFeatureEnabledOnUser =
    session?.user?.featureFlags["experimentsV4Enabled"] ?? false;

  const { hasRoleAccess, isEnabled: canAccessExperiments } =
    getExperimentsAccess({
      isLangfuseCloud,
      isV4BetaEnabled,
      isAdmin,
      isFeatureEnabledOnUser,
    });

  const [isExperimentsBetaEnabled, setExperimentsBetaEnabled] =
    useLocalStorage<boolean>(
      getStorageKey(EXPERIMENTS_BETA_KEY_PREFIX, userId),
      false,
    );

  return {
    canAccessExperiments,
    canUseExperimentsBetaToggle: canAccessExperiments,
    canSeeExperimentsNav: canAccessExperiments,
    isExperimentsBetaActive:
      canAccessExperiments && isExperimentsBetaEnabled && isV4BetaEnabled,
    isExperimentsBetaEnabled,
    setExperimentsBetaEnabled,
    isAdmin,
    isFeatureEnabledOnUser,
    hasRoleAccess,
    isV4BetaEnabled,
  };
}
