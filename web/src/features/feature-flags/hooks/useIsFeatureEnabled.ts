import { useSession } from "next-auth/react";
import {
  isInternalOnlyFeaturePreviewFlag,
  isInternalFlag,
  isRestrictedFlag,
} from "../available-flags";
import type { Flag } from "../types";
import {
  getContextualFeatureFlags,
  hasInternalAccess,
  isInternalViewEnabled,
} from "../utils";

export default function useIsFeatureEnabled(
  feature: Flag,
  {
    projectId,
    organizationId,
  }: {
    projectId?: string;
    organizationId?: string;
  } = {},
): boolean {
  const session = useSession();

  const isExperimentalFeaturesEnabled =
    session.data?.environment.enableExperimentalFeatures ?? false;

  const isFeatureEnabledOnUser =
    getContextualFeatureFlags(session.data?.user, {
      projectId,
      organizationId,
    })?.[feature] ?? false;

  if (isInternalFlag(feature)) {
    return isInternalViewEnabled(session.data);
  }

  if (isRestrictedFlag(feature) || isInternalOnlyFeaturePreviewFlag(feature)) {
    return isFeatureEnabledOnUser;
  }

  return (
    hasInternalAccess({ isExperimentalFeaturesEnabled }) ||
    isFeatureEnabledOnUser
  );
}
