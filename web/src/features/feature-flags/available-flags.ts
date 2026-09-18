import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  "sessionTimeline",
  "normalizedIoPreview",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

const adminOnlyFeaturePreviewFlags = ["langfuseTopics"] as const;

export const personalFeaturePreviewFlags = [
  ...featurePreviewFlags,
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
  normalizedIoPreview: "Improved Message Rendering",
  langfuseTopics: "Langfuse Topics",
} satisfies Record<PersonalFeaturePreviewFlag, string>;

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

  if (flag === "normalizedIoPreview") {
    return true;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...personalFeaturePreviewFlags,
  ...restrictedFlags,
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
