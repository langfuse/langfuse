import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  // TODO(remove ~2026-06-19): "searchBar" is retired — the grammar search bar
  // is now GA on the v4 events tables for everyone (see useSearchBarEnabled),
  // no longer a per-user Feature Preview opt-in. Kept as dead plumbing for a
  // safe rollback; drop once the GA rollout is confirmed stable.
  "searchBar",
  "v4UpgradeUi",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

export type FeaturePreviewAvailabilityContext = {
  v4BetaEnabled: boolean;
};

export const isFeaturePreviewAvailable = (
  flag: FeaturePreviewFlag,
  context: FeaturePreviewAvailabilityContext,
) => {
  if (flag === "modernSession") {
    return context.v4BetaEnabled;
  }

  if (flag === "searchBar") {
    return true;
  }

  if (flag === "v4UpgradeUi") {
    return true;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...featurePreviewFlags,
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
