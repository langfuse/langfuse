import { assertUnreachable } from "@langfuse/shared";

export const organizationOnlyFeaturePreviewFlags = [
  "externalMediaStorage",
] as const;

export const userFeaturePreviewFlags = [
  "modernSession",
  "sessionTimeline",
] as const;

export type UserFeaturePreviewFlag = (typeof userFeaturePreviewFlags)[number];

export const featurePreviewFlags = [
  ...organizationOnlyFeaturePreviewFlags,
  ...userFeaturePreviewFlags,
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

export const isOrganizationOnlyFeaturePreviewFlag = (
  flag: FeaturePreviewFlag,
): flag is (typeof organizationOnlyFeaturePreviewFlags)[number] =>
  organizationOnlyFeaturePreviewFlags.some(
    (organizationFlag) => organizationFlag === flag,
  );

const adminOnlyFeaturePreviewFlags = ["langfuseTopics"] as const;

export const personalFeaturePreviewFlags = [
  ...userFeaturePreviewFlags,
  ...adminOnlyFeaturePreviewFlags,
] as const;

export type PersonalFeaturePreviewFlag =
  (typeof personalFeaturePreviewFlags)[number];

export const isAdminOnlyFeaturePreviewFlag = (
  flag: string,
): flag is (typeof adminOnlyFeaturePreviewFlags)[number] =>
  adminOnlyFeaturePreviewFlags.some((adminFlag) => adminFlag === flag);

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
  externalMediaStorage: "External Media Storage",
  modernSession: "Compact Session View",
  sessionTimeline: "Session Timeline",
  langfuseTopics: "Langfuse Topics",
} satisfies Record<FeaturePreviewFlag | PersonalFeaturePreviewFlag, string>;

export type FeaturePreviewAvailabilityContext = {
  v4BetaEnabled: boolean;
};

export const isFeaturePreviewAvailable = (
  flag: FeaturePreviewFlag,
  context: FeaturePreviewAvailabilityContext,
) => {
  if (flag === "externalMediaStorage") {
    return true;
  }
  if (flag === "modernSession" || flag === "sessionTimeline") {
    return context.v4BetaEnabled;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...featurePreviewFlags,
  ...adminOnlyFeaturePreviewFlags,
  ...restrictedFlags,
  INTERNAL_FEATURE_FLAG,
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
