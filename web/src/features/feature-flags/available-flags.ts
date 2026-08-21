import { assertUnreachable } from "@langfuse/shared";

export const featurePreviewFlags = [
  "modernSession",
  // TODO(remove ~2026-06-19): "searchBar" is retired — the grammar search bar
  // is now GA on the v4 events tables for everyone (see useSearchBarEnabled),
  // no longer a per-user Feature Preview opt-in. Kept as dead plumbing for a
  // safe rollback; drop once the GA rollout is confirmed stable.
  "searchBar",
  "v4UpgradeUi",
  "compactTimeline",
] as const;

export type FeaturePreviewFlag = (typeof featurePreviewFlags)[number];

export const organizationManageableFeaturePreviewFlags = [
  "modernSession",
  "v4UpgradeUi",
  "compactTimeline",
] as const satisfies readonly FeaturePreviewFlag[];

export type OrganizationManageableFeaturePreviewFlag =
  (typeof organizationManageableFeaturePreviewFlags)[number];

export const featurePreviewMetadata: Record<
  FeaturePreviewFlag,
  { title: string; description: string }
> = {
  modernSession: {
    title: "Compact Session View",
    description:
      "Navigate every trace in a session from one continuous conversation feed, with tools and structured data available on demand.",
  },
  searchBar: {
    title: "Filter Search Bar",
    description:
      "A keyboard-driven query bar on the Observations and Traces tables — type filters like level:ERROR -env:dev latency:>2 with inline suggestions, alongside the existing filter sidebar.",
  },
  v4UpgradeUi: {
    title: "V4 Migration",
    description:
      "Review each project's readiness for Langfuse v4 and get guided steps for anything that still needs an update.",
  },
  compactTimeline: {
    title: "Compact Timeline",
    description:
      "See a whole trace at once — every observation a single dense line, coloured by type — then zoom and pan it like a map.",
  },
};

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

  if (flag === "compactTimeline") {
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
