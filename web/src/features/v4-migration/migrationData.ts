import { type RouterOutputs } from "@/src/utils/api";
import { normalizeLegacyApiEntrypoint } from "@/src/features/v4/utils";
import { type V4MigrationSdkState } from "@/src/features/v4-migration/sdkVersionStatus";

export const V4_MIGRATION_LOOKBACK_DAYS = 7;

const V4_MIGRATION_LOOKBACK_MS =
  V4_MIGRATION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
const RANGE_BUCKET_MS = 60 * 60 * 1000;

export const createV4MigrationDetectionRange = (now = Date.now()) => {
  const toTimestamp = new Date(
    (Math.floor(now / RANGE_BUCKET_MS) + 1) * RANGE_BUCKET_MS,
  );
  return {
    fromTimestamp: new Date(toTimestamp.getTime() - V4_MIGRATION_LOOKBACK_MS),
    toTimestamp,
  };
};

export type MigrationCountState =
  | { status: "loading"; count: 0 }
  | { status: "error"; count: 0 }
  | { status: "loaded"; count: number };

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

export type ProjectMigrationStatus = {
  sdk: V4MigrationSdkState;
  evals: MigrationCountState;
  apis: MigrationCountState;
  exports: MigrationCountState;
};

export type ProjectMigrationReadiness =
  | "checking"
  | "unavailable"
  | "ready"
  | "action-needed";

export const getProjectMigrationReadiness = (
  status: ProjectMigrationStatus,
): ProjectMigrationReadiness => {
  const counts = [status.evals, status.apis, status.exports];

  if (
    status.sdk.status === "error" ||
    counts.some((count) => count.status === "error")
  ) {
    return "unavailable";
  }
  if (
    status.sdk.status === "checking" ||
    counts.some((count) => count.status === "loading")
  ) {
    return "checking";
  }
  if (
    (status.sdk.status === "latest" || status.sdk.status === "otel_realtime") &&
    counts.every((count) => count.count === 0)
  ) {
    return "ready";
  }
  return "action-needed";
};

type LegacyApiUsagePoint =
  RouterOutputs["v4Transition"]["timeSeriesByEntrypoint"][number];

type LegacyApiUsageSummary = {
  endpoint: string;
  count: number;
  lastSeen: string;
};

export const aggregateLegacyApiUsage = (
  rows: LegacyApiUsagePoint[] | undefined,
): LegacyApiUsageSummary[] => {
  const usageByEndpoint = new Map<
    string,
    { count: number; lastSeen: string }
  >();

  for (const row of rows ?? []) {
    const endpoint = normalizeLegacyApiEntrypoint(row.entrypoint);
    if (!endpoint || row.count <= 0 || !row.lastSeen) continue;
    const current = usageByEndpoint.get(endpoint);
    usageByEndpoint.set(endpoint, {
      count: (current?.count ?? 0) + row.count,
      lastSeen:
        current && current.lastSeen > row.lastSeen
          ? current.lastSeen
          : row.lastSeen,
    });
  }

  return Array.from(usageByEndpoint, ([endpoint, usage]) => ({
    endpoint,
    ...usage,
  })).sort(
    (left, right) =>
      right.count - left.count || left.endpoint.localeCompare(right.endpoint),
  );
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
