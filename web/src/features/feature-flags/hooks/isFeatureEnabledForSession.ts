import { type Session } from "next-auth";

import { getSessionEnvironment } from "@/src/features/rbac/new/sessionAccessors";
import {
  isInternalFeaturePreviewFlag,
  isInternalFlag,
  isRestrictedFlag,
} from "@/src/features/feature-flags/available-flags";
import { type Flag } from "@/src/features/feature-flags/types";
import {
  getContextualFeatureFlags,
  isInternalViewEnabled,
} from "@/src/features/feature-flags/utils";

/** isFeatureEnabledForSession reports whether feature is on for the session's user in the given organization or project. */
export function isFeatureEnabledForSession(
  session: Session | null,
  feature: Flag,
  {
    projectId,
    organizationId,
  }: {
    projectId?: string;
    organizationId?: string;
  },
): boolean {
  const isExperimentalFeaturesEnabled =
    getSessionEnvironment(session)?.enableExperimentalFeatures ?? false;

  const isFeatureEnabledOnUser =
    getContextualFeatureFlags(session, {
      projectId,
      organizationId,
    })?.[feature] ?? false;

  if (isInternalFlag(feature)) {
    return isInternalViewEnabled(session);
  }

  if (isRestrictedFlag(feature) || isInternalFeaturePreviewFlag(feature)) {
    return isFeatureEnabledOnUser;
  }

  return isExperimentalFeaturesEnabled || isFeatureEnabledOnUser;
}
