import { useSession } from "next-auth/react";
import { isInternalOnlyFlag } from "../available-flags";
import type { Flag } from "../types";
import { getContextualFeatureFlags } from "../utils";

export default function useIsFeatureEnabled(
  feature: Flag,
  {
    enableForAdmins = true,
    projectId,
    organizationId,
  }: {
    enableForAdmins?: boolean;
    projectId?: string;
    organizationId?: string;
  } = {},
): boolean {
  const session = useSession();

  const isAdmin = session.data?.user?.admin ?? false;

  const isExperimentalFeaturesEnabled =
    session.data?.environment.enableExperimentalFeatures ?? false;

  const isFeatureEnabledOnUser =
    getContextualFeatureFlags(session.data?.user, {
      projectId,
      organizationId,
    })?.[feature] ?? false;

  if (isInternalOnlyFlag(feature)) {
    return isFeatureEnabledOnUser;
  }

  return (
    isExperimentalFeaturesEnabled ||
    (enableForAdmins && isAdmin) ||
    isFeatureEnabledOnUser
  );
}
