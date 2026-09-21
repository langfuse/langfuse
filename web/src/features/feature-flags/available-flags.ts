import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  "sessionTimeline",
  "normalizedIoPreview",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

const restrictedFlags = ["aiGateway"] as const;

type RestrictedFlag = (typeof restrictedFlags)[number];

export const isRestrictedFlag = (flag: string): flag is RestrictedFlag =>
  restrictedFlags.some((restrictedFlag) => restrictedFlag === flag);

/**
 * Flags for Langfuse-internal surfaces. They are on for Langfuse admins and
 * for deployments with experimental features enabled, and for nobody else:
 * they are not feature previews, cannot be granted, and are never persisted.
 */
const internalFlags = ["traceMessages"] as const;

type InternalFlag = (typeof internalFlags)[number];

export const isInternalFlag = (flag: string): flag is InternalFlag =>
  internalFlags.some((internalFlag) => internalFlag === flag);

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

  if (flag === "normalizedIoPreview") {
    return true;
  }

  return assertUnreachable(flag);
};

export const availableFlags = [
  ...featurePreviewFlags,
  ...restrictedFlags,
  ...internalFlags,
  "searchBar",
  "templateFlag",
  "excludeClickhouseRead",
  "v4BetaToggleVisible",
  "observationEvals",
  "experimentsV4Enabled",
] as const;
