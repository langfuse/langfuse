import { assertUnreachable } from "@langfuse/shared";

export const userFeaturePreviewFlags = [
  "sessionViewV2",
  "sessionViewV2Timeline",
] as const;

export type UserFeaturePreviewFlag = (typeof userFeaturePreviewFlags)[number];

export const defaultOnFeaturePreviewFlags = [
  "sessionViewV2",
  "sessionViewV2Timeline",
] as const;

export const featurePreviewFlags = [...userFeaturePreviewFlags] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

const internalFeaturePreviewFlags = [
  "langfuseTopics",
  "unifiedTraceSessionView",
] as const;

export const personalFeaturePreviewFlags = [
  ...userFeaturePreviewFlags,
  ...internalFeaturePreviewFlags,
] as const;

export type PersonalFeaturePreviewFlag =
  (typeof personalFeaturePreviewFlags)[number];

export const isInternalFeaturePreviewFlag = (
  flag: string,
): flag is (typeof internalFeaturePreviewFlags)[number] =>
  internalFeaturePreviewFlags.some((internalFlag) => internalFlag === flag);

const restrictedFlags = ["aiGateway"] as const;

type RestrictedFlag = (typeof restrictedFlags)[number];

export const isRestrictedFlag = (flag: string): flag is RestrictedFlag =>
  restrictedFlags.some((restrictedFlag) => restrictedFlag === flag);

/**
 * Internal surfaces share one user preference, separate from customer previews.
 * The preference never grants access to users without internal eligibility.
 */
export const INTERNAL_FEATURE_FLAG = "internalFeatures" as const;

export type UserFeatureFlag =
  | PersonalFeaturePreviewFlag
  | typeof INTERNAL_FEATURE_FLAG;

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
  sessionViewV2: "Redesigned Session View",
  sessionViewV2Timeline: "Session Timeline",
  langfuseTopics: "Langfuse Topics",
  unifiedTraceSessionView: "Unified Trace and Session View",
} satisfies Record<FeaturePreviewFlag | PersonalFeaturePreviewFlag, string>;

export type FeaturePreviewAvailabilityContext = {
  v4BetaEnabled: boolean;
};

export const isFeaturePreviewAvailable = (
  flag: FeaturePreviewFlag,
  context: FeaturePreviewAvailabilityContext,
) => {
  if (flag === "sessionViewV2" || flag === "sessionViewV2Timeline") {
    return context.v4BetaEnabled;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...featurePreviewFlags,
  ...internalFeaturePreviewFlags,
  ...restrictedFlags,
  INTERNAL_FEATURE_FLAG,
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
