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

/** Flags only Langfuse/ClickHouse employees can enable. Never shown to customers. */
export const internalFlags = ["inAppAgentTraceLink"] as const;

export type InternalFlag = (typeof internalFlags)[number];

export const isInternalFlag = (flag: string): flag is InternalFlag =>
  internalFlags.some((internalFlag) => internalFlag === flag);

export const internalFlagLabels = {
  inAppAgentTraceLink: "In-app agent trace links",
} satisfies Record<InternalFlag, string>;

export const internalFlagDescriptions = {
  inAppAgentTraceLink:
    "After each assistant turn, show a link to the Langfuse product trace for that run.",
} satisfies Record<InternalFlag, string>;

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
