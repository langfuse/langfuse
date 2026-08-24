import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  "compactTimeline",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

export const organizationManageableFeaturePreviewFlags = [
  ...featurePreviewFlags,
] as const;

export type OrganizationManageableFeaturePreviewFlag =
  (typeof organizationManageableFeaturePreviewFlags)[number];

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

  if (flag === "compactTimeline") {
    return true;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...featurePreviewFlags,
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
