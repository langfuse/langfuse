import { useSession } from "next-auth/react";
import type { Flag } from "../types";

export default function useIsExperimentV4Enabled(feature: Flag): boolean {
  const session = useSession();

  const isAdmin = session.data?.user?.admin ?? false;

  const isFeatureEnabledOnUser =
    session.data?.user?.featureFlags[feature] ?? false;

  return isAdmin || isFeatureEnabledOnUser;
}
