import {
  availableFlags,
  filterFeaturePreviewFlags,
  isFeaturePreviewFlag,
  isFeaturePreviewAvailable,
  type FeaturePreviewAvailabilityContext,
  type FeaturePreviewFlag,
} from "./available-flags";
import { type Flags } from "./types";

export const getFeaturePreviewOptOutFlag = (flag: FeaturePreviewFlag) =>
  `feature-preview:${flag}:disabled`;

const receivesFeaturePreviewsByDefault = (email: string | null | undefined) => {
  const normalizedEmail = email?.toLowerCase();
  return (
    normalizedEmail?.endsWith("@langfuse.com") === true ||
    normalizedEmail?.endsWith("@clickhouse.com") === true
  );
};

export const parseFlags = (
  dbFlags: string[],
  context: FeaturePreviewAvailabilityContext & {
    email: string | null | undefined;
  },
): Flags => {
  const parsedFlags = {} as Flags;
  const enableFeaturePreviewsByDefault = receivesFeaturePreviewsByDefault(
    context.email,
  );

  availableFlags.forEach((flag) => {
    if (
      isFeaturePreviewFlag(flag) &&
      dbFlags.includes(getFeaturePreviewOptOutFlag(flag))
    ) {
      parsedFlags[flag] = false;
      return;
    }

    if (
      enableFeaturePreviewsByDefault &&
      isFeaturePreviewFlag(flag) &&
      isFeaturePreviewAvailable(flag, context)
    ) {
      parsedFlags[flag] = true;
      return;
    }

    parsedFlags[flag] = dbFlags.includes(flag);
  });

  return parsedFlags;
};

export const parseFlagsWithOrganizationDefaults = (
  dbFlags: string[],
  organizationDefaults: string[],
  context: FeaturePreviewAvailabilityContext & {
    email: string | null | undefined;
  },
): Flags => {
  const featurePreviewDefaults =
    filterFeaturePreviewFlags(organizationDefaults);

  return parseFlags(dbFlags.concat(featurePreviewDefaults), context);
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
