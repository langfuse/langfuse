import { type Session } from "next-auth";
import { useSession } from "next-auth/react";

import { getSessionEnvironment } from "@/src/features/auth/lib/sessionAccessors";
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
  return isFeatureEnabledForSession(session.data, feature, {
    projectId,
    organizationId,
  });
}

/** isFeatureEnabledForSession reports whether feature is on for the session's user in the given organization or project. */
function isFeatureEnabledForSession(
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
