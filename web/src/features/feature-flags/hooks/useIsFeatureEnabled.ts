import { useSession } from "next-auth/react";

import { api } from "@/src/utils/api";

import type { Flag } from "../types";

export default function useIsFeatureEnabled(feature: Flag): boolean {
  const session = useSession();
  const isExperimentalFeaturesEnabled =
    api.environment.enableExperimentalFeatures.useQuery().data ?? false;
  const isFeatureEnabledOnUser =
    session.data?.user?.featureFlags[feature] ?? false;

  return isExperimentalFeaturesEnabled || isFeatureEnabledOnUser;
}
