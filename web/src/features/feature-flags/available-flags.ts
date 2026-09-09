import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = ["modernSession"] as const;

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
  // Internal flag (deliberately NOT in featurePreviewFlags): gates the
  // normalized-parser formatted trace view for admins/flagged users only.
  "normalizedIoPreview",
] as const;
