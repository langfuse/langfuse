/* eslint-disable no-nested-ternary */
import type { Session } from "next-auth";
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
 * Platform admins, staff email domains and experimental deployments can use
 * internal surfaces. This eligibility does not grant admin permissions.
 */
export const hasInternalAccess = ({
  isAdmin,
  isExperimentalFeaturesEnabled,
  email,
}: {
  isAdmin: boolean;
  isExperimentalFeaturesEnabled: boolean;
  email: string | null | undefined;
}) => isExperimentalFeaturesEnabled || isAdmin || hasInternalEmailDomain(email);

export const isInternalViewEnabled = (session: Session | null | undefined) =>
  hasInternalAccess({
    email: session?.user?.email,
    isAdmin: session?.user?.admin === true,
    isExperimentalFeaturesEnabled:
      session?.environment?.enableExperimentalFeatures === true,
  }) && session?.user?.featureFlags[INTERNAL_FEATURE_FLAG] !== false;

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

type ContextualFeatureFlagUser = {
  featureFlags: Flags;
  organizations: Array<{
    id: string;
    featureFlags?: Flags;
    projects: Array<{ id: string }>;
  }>;
};

export const getContextualFeatureFlags = (
  user: ContextualFeatureFlagUser | null | undefined,
  {
    projectId,
    organizationId,
  }: { projectId?: string; organizationId?: string } = {},
): Flags | undefined => {
  if (!user) return undefined;

  const organization = organizationId
    ? user.organizations.find((candidate) => candidate.id === organizationId)
    : projectId
      ? user.organizations.find((candidate) =>
          candidate.projects.some((project) => project.id === projectId),
        )
      : undefined;

  return organization?.featureFlags ?? user.featureFlags;
};
