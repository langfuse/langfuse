import { useSession } from "next-auth/react";
import {
  isInternalFeaturePreviewFlag,
  isInternalFlag,
  isRestrictedFlag,
} from "../available-flags";
import type { Flag } from "../types";
import { getContextualFeatureFlags, isInternalViewEnabled } from "../utils";

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

  if (isRestrictedFlag(feature) || isInternalFeaturePreviewFlag(feature)) {
    return isFeatureEnabledOnUser;
  }

  return isExperimentalFeaturesEnabled || isFeatureEnabledOnUser;
}
