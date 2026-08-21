import {
  availableFlags,
  featurePreviewFlags,
  isFeaturePreviewAvailable,
  organizationManageableFeaturePreviewFlags,
  type FeaturePreviewAvailabilityContext,
  type FeaturePreviewFlag,
} from "./available-flags";
import { type Flags } from "./types";

const isFeaturePreviewFlag = (
  flag: (typeof availableFlags)[number],
): flag is FeaturePreviewFlag =>
  featurePreviewFlags.some((previewFlag) => previewFlag === flag);

export const getFeaturePreviewOptOutFlag = (flag: FeaturePreviewFlag) =>
  `feature-preview:${flag}:disabled`;

export const receivesFeaturePreviewsByDefault = (
  email: string | null | undefined,
) => {
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
  const manageableDefaults = organizationDefaults.filter((flag) =>
    organizationManageableFeaturePreviewFlags.some(
      (manageableFlag) => manageableFlag === flag,
    ),
  );

  return parseFlags([...dbFlags, ...manageableDefaults], context);
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
