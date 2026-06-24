import { context, propagation } from "@opentelemetry/api";

export const CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION = "1" as const;

export const clickHouseQuerySurfaces = [
  "trpc",
  "worker",
  "publicapi",
  "mcp",
] as const;

export type ClickHouseQuerySurface = (typeof clickHouseQuerySurfaces)[number];

export const clickHouseQueryFeatures = [
  "tracing",
  "scores",
  "datasets",
  "dashboards",
  "custom-query",
  "ingestion",
  "batch-export",
  "retention",
  "deletion",
  "event-propagation",
  "eval-execution",
  "health",
  "models",
  "mcp",
] as const;

export type ClickHouseQueryFeature = (typeof clickHouseQueryFeatures)[number];

export type ClickHouseQueryTags = {
  surface?: ClickHouseQuerySurface;
  route?: string;
  feature: ClickHouseQueryFeature | (string & {});
  projectId?: string;
  [key: string]: unknown;
};

export type ClickHouseQueryContextTags = Pick<
  ClickHouseQueryTags,
  "surface" | "route"
>;

export type NormalizedClickHouseQueryTags = {
  tag_schema_version: typeof CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION;
  surface: ClickHouseQuerySurface;
  route: string;
  feature: ClickHouseQueryFeature;
  projectId?: string;
};

const TEST_FALLBACK_CLICKHOUSE_QUERY_TAGS = {
  surface: "worker",
  route: "vitest",
  feature: "custom-query",
} as const satisfies Pick<
  NormalizedClickHouseQueryTags,
  "surface" | "route" | "feature"
>;

export const CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS = {
  surface: "langfuse.clickhouse.surface",
  route: "langfuse.clickhouse.route",
  projectId: "langfuse.project.id",
} as const;

const surfaceSet = new Set<string>(clickHouseQuerySurfaces);
const featureSet = new Set<string>(clickHouseQueryFeatures);

let clickHouseQueryTagTestFallbackEnabled = true;

export function setClickHouseQueryTagTestFallbackForTests(
  enabled: boolean,
): void {
  clickHouseQueryTagTestFallbackEnabled = enabled;
}

function getTestFallbackClickHouseQueryTags():
  | typeof TEST_FALLBACK_CLICKHOUSE_QUERY_TAGS
  | undefined {
  /* eslint-disable turbo/no-undeclared-env-vars -- This fallback is intentionally limited to test runners without loading env validation. */
  const isTestRuntime =
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    process.env.VITEST_WORKER_ID !== undefined;
  /* eslint-enable turbo/no-undeclared-env-vars */

  if (isTestRuntime && clickHouseQueryTagTestFallbackEnabled) {
    return TEST_FALLBACK_CLICKHOUSE_QUERY_TAGS;
  }
}

export function normalizeClickHouseQueryTags(
  tags: ClickHouseQueryTags,
): NormalizedClickHouseQueryTags {
  const baggage = propagation.getBaggage(context.active());
  const fallbackTags = getTestFallbackClickHouseQueryTags();
  const providedTags = tags as ClickHouseQueryTags | undefined;
  const surface =
    providedTags?.surface ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.surface)?.value ??
    fallbackTags?.surface;
  const route =
    providedTags?.route ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.route)?.value ??
    fallbackTags?.route;
  const feature = providedTags?.feature ?? fallbackTags?.feature;
  const projectId =
    providedTags?.projectId ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.projectId)?.value;

  if (!surface || !surfaceSet.has(surface)) {
    throw new Error(
      `Missing or invalid ClickHouse query tag surface: ${surface ?? "<missing>"}`,
    );
  }
  if (!route || !route.trim()) {
    throw new Error("Missing ClickHouse query tag route");
  }
  if (!feature || !featureSet.has(feature)) {
    throw new Error(
      `Missing or invalid ClickHouse query tag feature: ${feature ?? "<missing>"}`,
    );
  }

  return {
    tag_schema_version: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    surface: surface as ClickHouseQuerySurface,
    route: route.trim(),
    feature: feature as ClickHouseQueryFeature,
    ...(projectId ? { projectId } : {}),
  };
}

export function buildClickHouseLogComment(tags: ClickHouseQueryTags): string {
  return JSON.stringify(normalizeClickHouseQueryTags(tags));
}
