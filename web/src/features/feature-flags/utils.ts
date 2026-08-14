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

// Mirrors LANGFUSE_MIGRATION_V4_WRITE_MODE (packages/shared/src/env.ts). Kept as
// a local string union so this frontend-safe module does not import the
// server-only env schema.
export type V4WriteMode = "legacy" | "dual" | "events_only";

export type FeaturePreviewDefaultContext = FeaturePreviewAvailabilityContext & {
  email: string | null | undefined;
  isLangfuseCloud: boolean;
  v4WriteMode: V4WriteMode;
};

/**
 * Whether a Feature Preview flag is switched on by default for this user and
 * deployment, before the user's explicit opt-out is applied. Both the session
 * flag parser and the toggle mutation consult this so a default-on flag can be
 * turned back off by persisting an opt-out marker instead of silently
 * reappearing on the next session.
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

  // The v4 migration/upgrade UI is on by default wherever the v4 events tables
  // are the read path: on Langfuse Cloud, and on self-hosted deployments whose
  // write mode is `events_only` or `dual`. Self-hosted `legacy` deployments do
  // not write the events tables, so the migration surfaces would have nothing
  // to read — keep it off there. Operators can still opt out.
  if (flag === "v4UpgradeUi") {
    return context.isLangfuseCloud || context.v4WriteMode !== "legacy";
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
