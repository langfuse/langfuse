import { useSession } from "next-auth/react";
import {
  isAdminOnlyFeaturePreviewFlag,
  INTERNAL_FEATURE_FLAG,
  isInternalFlag,
  isRestrictedFlag,
} from "../available-flags";
import type { Flag } from "../types";
import { getContextualFeatureFlags, hasInternalAccess } from "../utils";

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

  if (isInternalFlag(feature)) {
    return (
      hasInternalAccess({ isAdmin, isExperimentalFeaturesEnabled }) &&
      session.data?.user?.featureFlags[INTERNAL_FEATURE_FLAG] !== false
    );
  }

  if (isRestrictedFlag(feature) || isAdminOnlyFeaturePreviewFlag(feature)) {
    return isFeatureEnabledOnUser;
  }

  return (
    hasInternalAccess({
      isAdmin: enableForAdmins && isAdmin,
      isExperimentalFeaturesEnabled,
    }) || isFeatureEnabledOnUser
  );
}
