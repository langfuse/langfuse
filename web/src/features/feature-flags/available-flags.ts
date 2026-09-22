import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  "sessionTimeline",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

const restrictedFlags = ["aiGateway"] as const;

type RestrictedFlag = (typeof restrictedFlags)[number];

export const isRestrictedFlag = (flag: string): flag is RestrictedFlag =>
  restrictedFlags.some((restrictedFlag) => restrictedFlag === flag);

/**
 * Internal surfaces share one user preference, separate from customer previews.
 * The preference never grants access to users without internal eligibility.
 */
export const INTERNAL_FEATURE_FLAG = "internalFeatures" as const;

export type UserFeatureFlag = FeaturePreviewFlag | typeof INTERNAL_FEATURE_FLAG;

export const isInternalFlag = (
  flag: string,
): flag is typeof INTERNAL_FEATURE_FLAG => flag === INTERNAL_FEATURE_FLAG;

export const isFeaturePreviewFlag = (
  flag: string,
): flag is FeaturePreviewFlag =>
  featurePreviewFlags.some((previewFlag) => previewFlag === flag);

export const filterFeaturePreviewFlags = (
  flags: string[],
): FeaturePreviewFlag[] => flags.filter(isFeaturePreviewFlag);

export const featurePreviewLabels = {
  modernSession: "Compact Session View",
  sessionTimeline: "Session Timeline",
} satisfies Record<FeaturePreviewFlag, string>;

export type FeaturePreviewAvailabilityContext = {
  v4BetaEnabled: boolean;
};

export const isFeaturePreviewAvailable = (
  flag: FeaturePreviewFlag,
  context: FeaturePreviewAvailabilityContext,
) => {
  if (flag === "modernSession" || flag === "sessionTimeline") {
    return context.v4BetaEnabled;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...featurePreviewFlags,
  ...restrictedFlags,
  INTERNAL_FEATURE_FLAG,
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
  "skills",
] as const;
