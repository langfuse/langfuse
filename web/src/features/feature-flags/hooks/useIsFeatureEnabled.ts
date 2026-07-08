import { useSession } from "next-auth/react";
import type { Flag } from "../types";

export default function useIsFeatureEnabled(feature: Flag): boolean {
  const session = useSession();

  const isAdmin = session.data?.user?.admin ?? false;

  const isExperimentalFeaturesEnabled =
    session.data?.environment.enableExperimentalFeatures ?? false;

  const isFeatureEnabledOnUser =
    session.data?.user?.featureFlags[feature] ?? false;

  return isExperimentalFeaturesEnabled || isAdmin || isFeatureEnabledOnUser;
}
