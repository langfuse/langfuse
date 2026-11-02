import { type RouterOutputs } from "@/src/utils/api";
import { type V4MigrationSdkState } from "@/src/features/v4-migration/sdkVersionStatus";

export const V4_MIGRATION_LOOKBACK_DAYS = 3;

export type MigrationCountState =
  | { status: "loading"; count: 0 }
  | { status: "error"; count: 0 }
  | { status: "loaded"; count: number };

export type MigrationActionState =
  | { status: "loading"; result: null }
  | { status: "error"; result: null }
  | {
      status: "loaded";
      result: "required" | "not_required" | "sdk_usage_inconclusive";
    };

const loadingMigrationCount = {
  status: "loading",
  count: 0,
} as const satisfies MigrationCountState;

const errorMigrationCount = {
  status: "error",
  count: 0,
} as const satisfies MigrationCountState;

const loadedMigrationCount = (count: number): MigrationCountState => ({
  status: "loaded",
  count,
});

export const getMigrationCountState = <T>(
  query: {
    data: T | undefined;
    isError: boolean;
  } | null,
  getCount: (data: T) => number,
): MigrationCountState => {
  if (query?.data !== undefined) {
    return loadedMigrationCount(getCount(query.data));
  }
  return query?.isError ? errorMigrationCount : loadingMigrationCount;
};

export const getMigrationActionState = <T>(
  query: {
    data: T | undefined;
    isError: boolean;
  } | null,
  getResult: (
    data: T,
  ) => "required" | "not_required" | "sdk_usage_inconclusive" | "check_failed",
): MigrationActionState => {
  if (query?.data !== undefined) {
    const result = getResult(query.data);
    return result === "check_failed"
      ? { status: "error", result: null }
      : { status: "loaded", result };
  }
  return query?.isError
    ? { status: "error", result: null }
    : { status: "loading", result: null };
};

export type ProjectMigrationStatus = {
  sdk: V4MigrationSdkState;
  evals: MigrationCountState;
  experiments: MigrationActionState;
  apis: MigrationCountState;
  exports: MigrationCountState;
  // Whether the project is forced onto the v3 experience (partner-managed
  // upgrade). Always set; `true` short-circuits readiness to "partner-managed".
  forceV3Experience: boolean;
};

export type ProjectMigrationReadiness =
  | "checking"
  | "unavailable"
  | "ready"
  | "action-needed"
  | "partner-managed";

export const getProjectMigrationReadiness = (
  status: ProjectMigrationStatus,
): ProjectMigrationReadiness => {
  // Forced-v3 projects don't migrate themselves — their integration partner
  // does. Surface that instead of any migration action state.
  if (status.forceV3Experience) {
    return "partner-managed";
  }

  const counts = [status.evals, status.apis, status.exports];

  if (
    status.sdk.status === "error" ||
    status.experiments.status === "error" ||
    counts.some((count) => count.status === "error")
  ) {
    return "unavailable";
  }
  if (
    status.sdk.status === "checking" ||
    status.experiments.status === "loading" ||
    counts.some((count) => count.status === "loading")
  ) {
    return "checking";
  }
  if (
    (status.sdk.status === "latest" ||
      status.sdk.status === "otel_realtime" ||
      status.sdk.status === "no_data") &&
    status.experiments.result === "not_required" &&
    counts.every((count) => count.count === 0)
  ) {
    return "ready";
  }
  return "action-needed";
};

type LegacyIntegrationSummary =
  RouterOutputs["v4Transition"]["summary"]["legacyIntegrations"];

const LEGACY_INTEGRATION_LABELS: ReadonlyArray<
  readonly [keyof LegacyIntegrationSummary, string]
> = [
  ["posthog", "PostHog"],
  ["mixpanel", "Mixpanel"],
  ["blobStorage", "Blob Storage"],
];

export const getLegacyIntegrationLabels = (
  integrations: LegacyIntegrationSummary | undefined,
): string[] =>
  LEGACY_INTEGRATION_LABELS.filter(([key]) => integrations?.[key]).map(
    ([, label]) => label,
  );
