import type { Session } from "next-auth";
import {
  findSessionOrganization,
  findSessionProjectOrganization,
  getSessionEnvironment,
  getSessionUserEmail,
  getSessionUserFeatureFlags,
  type MaybeSession,
} from "@/src/features/rbac/new/sessionAccessors";
import {
  availableFlags,
  defaultOnFeaturePreviewFlags,
  filterFeaturePreviewFlags,
  isRestrictedFlag,
  isInternalFlag,
  isFeaturePreviewFlag,
  isFeaturePreviewAvailable,
  isInternalFeaturePreviewFlag,
  INTERNAL_FEATURE_FLAG,
  type FeaturePreviewAvailabilityContext,
  type UserFeatureFlag,
} from "./available-flags";
import { type Flags } from "./types";

export const getFeaturePreviewOptOutFlag = (flag: UserFeatureFlag) =>
  `feature-preview:${flag}:disabled`;

const hasInternalEmailDomain = (email: string | null | undefined) => {
  const normalizedEmail = email?.toLowerCase();
  return (
    normalizedEmail?.endsWith("@langfuse.com") === true ||
    normalizedEmail?.endsWith("@clickhouse.com") === true
  );
};

/**
 * Staff email domains and experimental deployments can use
 * internal surfaces. It never grants customer data access.
 */
export const hasInternalAccess = ({
  isExperimentalFeaturesEnabled,
  email,
}: {
  isExperimentalFeaturesEnabled: boolean;
  email: string | null | undefined;
}) => isExperimentalFeaturesEnabled || hasInternalEmailDomain(email);

export const isInternalViewEnabled = (session: Session | null | undefined) =>
  hasInternalAccess({
    email: getSessionUserEmail(session),
    isExperimentalFeaturesEnabled:
      getSessionEnvironment(session)?.enableExperimentalFeatures === true,
  }) && getSessionUserFeatureFlags(session)?.[INTERNAL_FEATURE_FLAG] !== false;

export const parseFlags = (
  dbFlags: string[],
  context: FeaturePreviewAvailabilityContext & {
    aiGatewayEnabled?: boolean;
  },
): Flags => {
  const parsedFlags = {} as Flags;

  availableFlags.forEach((flag) => {
    if (isRestrictedFlag(flag)) {
      parsedFlags[flag] = context.aiGatewayEnabled === true;
      return;
    }

    // Stored preference does not grant internal access.
    if (isInternalFlag(flag)) {
      parsedFlags[flag] = !dbFlags.includes(getFeaturePreviewOptOutFlag(flag));
      return;
    }

    if (
      (isFeaturePreviewFlag(flag) || isInternalFeaturePreviewFlag(flag)) &&
      dbFlags.includes(getFeaturePreviewOptOutFlag(flag))
    ) {
      parsedFlags[flag] = false;
      return;
    }

    if (
      defaultOnFeaturePreviewFlags.some(
        (defaultFlag) => defaultFlag === flag,
      ) &&
      isFeaturePreviewFlag(flag) &&
      isFeaturePreviewAvailable(flag, context)
    ) {
      parsedFlags[flag] = true;
      return;
    }

    parsedFlags[flag] = dbFlags.includes(flag);
  });

  if (!parsedFlags.sessionViewV2) {
    parsedFlags.sessionViewV2Timeline = false;
  }

  return parsedFlags;
};

export const parseFlagsWithOrganizationDefaults = (
  dbFlags: string[],
  organizationDefaults: string[],
  context: FeaturePreviewAvailabilityContext & {
    aiGatewayEnabled?: boolean;
  },
): Flags => {
  const featurePreviewDefaults =
    filterFeaturePreviewFlags(organizationDefaults);

  const organizationOptOuts = defaultOnFeaturePreviewFlags
    .map(getFeaturePreviewOptOutFlag)
    .filter((flag) => organizationDefaults.includes(flag));
  const flags = parseFlags(
    dbFlags.concat(featurePreviewDefaults, organizationOptOuts),
    context,
  );
  return flags;
};

/** getContextualFeatureFlags is the user's flags as resolved for the given organization or project. */
export const getContextualFeatureFlags = (
  session: MaybeSession,
  context: { projectId?: string; organizationId?: string } = {},
): Flags | undefined => {
  const userFlags = getSessionUserFeatureFlags(session);
  if (!userFlags) return undefined;
  return findContextOrganization(session, context)?.featureFlags ?? userFlags;
};

/** findContextOrganization is the organization a feature-flag context points at, preferring an explicit organization over a project's. */
function findContextOrganization(
  session: MaybeSession,
  {
    projectId,
    organizationId,
  }: { projectId?: string; organizationId?: string },
) {
  if (organizationId) return findSessionOrganization(session, organizationId);
  if (projectId) return findSessionProjectOrganization(session, projectId);
  return undefined;
}
