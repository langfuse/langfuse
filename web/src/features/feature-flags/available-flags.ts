import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  "sessionsSearchBar",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

export const isFeaturePreviewFlag = (
  flag: string,
): flag is FeaturePreviewFlag =>
  featurePreviewFlags.some((previewFlag) => previewFlag === flag);

export const filterFeaturePreviewFlags = (
  flags: string[],
): FeaturePreviewFlag[] => flags.filter(isFeaturePreviewFlag);

export const featurePreviewLabels = {
  modernSession: "Compact Session View",
  sessionsSearchBar: "Sessions Search Bar",
} satisfies Record<FeaturePreviewFlag, string>;

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

  if (flag === "sessionsSearchBar") {
    // Reads the events-backed sessions table, so it depends on v4 exactly as
    // modernSession does — without this, staff who get previews by default
    // would see the tile checked but disabled.
    return context.v4BetaEnabled;
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
