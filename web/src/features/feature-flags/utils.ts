import {
  availableFlags,
  featurePreviewFlags,
  isFeaturePreviewAvailable,
} from "./available-flags";
import type {
  FeaturePreviewAvailabilityContext,
  FeaturePreviewFlag,
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

export type FeaturePreviewDefaultContext = FeaturePreviewAvailabilityContext & {
  email: string | null | undefined;
  isLangfuseCloud: boolean;
};

/**
 * Whether a Feature Preview flag is switched on by default for this user and
 * deployment (before the user's explicit opt-out is applied). Both the session
 * flag parser and the toggle mutation consult this so a default-on flag can be
 * turned back off by persisting an opt-out marker rather than silently
 * reappearing.
 */
export const featurePreviewDefaultsToEnabled = (
  flag: FeaturePreviewFlag,
  context: FeaturePreviewDefaultContext,
): boolean => {
  // Langfuse/ClickHouse team members receive every available preview by default.
  if (
    receivesFeaturePreviewsByDefault(context.email) &&
    isFeaturePreviewAvailable(flag, context)
  ) {
    return true;
  }

  // Self-hosted deployments that read the v4 events tables get the v4 migration
  // UI by default, so operators see the upgrade guidance without first flipping
  // a Feature Preview toggle. Cloud keeps its existing per-user rollout.
  if (
    flag === "v4UpgradeUi" &&
    !context.isLangfuseCloud &&
    context.v4BetaEnabled
  ) {
    return true;
  }

  return false;
};

export const parseFlags = (
  dbFlags: string[],
  context: FeaturePreviewDefaultContext,
): Flags => {
  const parsedFlags = {} as Flags;

  availableFlags.forEach((flag) => {
    if (
      isFeaturePreviewFlag(flag) &&
      featurePreviewDefaultsToEnabled(flag, context)
    ) {
      parsedFlags[flag] = !dbFlags.includes(getFeaturePreviewOptOutFlag(flag));
      return;
    }

    parsedFlags[flag] = dbFlags.includes(flag);
  });

  return parsedFlags;
};
