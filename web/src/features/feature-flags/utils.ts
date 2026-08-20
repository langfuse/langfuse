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

/**
 * Whether `flag` is on for this user without an explicit entry in
 * `User.featureFlags` — i.e. whether an "off" has to be stored as an opt-out
 * marker rather than as the absence of an opt-in.
 *
 * Deliberately independent of `isFeaturePreviewAvailable`, so an opt-out
 * recorded today still holds once a deployment becomes eligible later.
 *
 * Known one-off: opt-outs made before the marker existed were stored as a plain
 * removal, which is byte-identical to never having touched the toggle. Those
 * users see `v4UpgradeUi` come back on once, and their next opt-out sticks.
 * There is nothing to key a backfill on — flipping the default for the empty
 * state is the point of this rule.
 */
export const featurePreviewDefaultsToEnabled = (
  flag: FeaturePreviewFlag,
  email: string | null | undefined,
): boolean =>
  receivesFeaturePreviewsByDefault(email) ||
  // The v4 migration UI is not a preview users have to discover: every
  // deployment that can act on the migration gets it by default, and the
  // Feature Preview modal only exists to opt back out.
  flag === "v4UpgradeUi";

export const parseFlags = (
  dbFlags: string[],
  context: FeaturePreviewAvailabilityContext & {
    email: string | null | undefined;
  },
): Flags => {
  const parsedFlags = {} as Flags;

  availableFlags.forEach((flag) => {
    if (!isFeaturePreviewFlag(flag)) {
      parsedFlags[flag] = dbFlags.includes(flag);
      return;
    }

    // Availability is a hard gate: a preview whose read path this deployment
    // does not support stays off even for a user holding an opt-in entry from
    // a deployment that used to support it.
    if (!isFeaturePreviewAvailable(flag, context)) {
      parsedFlags[flag] = false;
      return;
    }

    parsedFlags[flag] = featurePreviewDefaultsToEnabled(flag, context.email)
      ? !dbFlags.includes(getFeaturePreviewOptOutFlag(flag))
      : dbFlags.includes(flag);
  });

  return parsedFlags;
};
