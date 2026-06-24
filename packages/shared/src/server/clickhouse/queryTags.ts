import { context, propagation } from "@opentelemetry/api";

export const CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION = "1" as const;
const UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE = "unknown" as const;

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
  surface?: ClickHouseQuerySurface | (string & {});
  route?: string;
  feature?: ClickHouseQueryFeature | (string & {});
  projectId?: string;
  [key: string]: unknown;
};

export type ClickHouseQueryContextTags = Pick<
  ClickHouseQueryTags,
  "surface" | "route"
>;

export type NormalizedClickHouseQueryTags = {
  tag_schema_version: typeof CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION;
  surface: ClickHouseQuerySurface | typeof UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE;
  route?: string;
  feature: ClickHouseQueryFeature | typeof UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE;
  projectId?: string;
};

export const CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS = {
  surface: "langfuse.clickhouse.surface",
  route: "langfuse.clickhouse.route",
  projectId: "langfuse.project.id",
} as const;

const surfaceSet = new Set<string>(clickHouseQuerySurfaces);
const featureSet = new Set<string>(clickHouseQueryFeatures);

const isClickHouseQuerySurface = (
  value: unknown,
): value is ClickHouseQuerySurface =>
  typeof value === "string" && surfaceSet.has(value);

const isClickHouseQueryFeature = (
  value: unknown,
): value is ClickHouseQueryFeature =>
  typeof value === "string" && featureSet.has(value);

export function normalizeClickHouseQueryTags(
  tags?: ClickHouseQueryTags,
): NormalizedClickHouseQueryTags {
  const baggage = propagation.getBaggage(context.active());
  const providedTags = tags as ClickHouseQueryTags | undefined;
  const surface =
    providedTags?.surface ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.surface)?.value;
  const route =
    providedTags?.route ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.route)?.value;
  const feature = providedTags?.feature;
  const projectId =
    providedTags?.projectId ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.projectId)?.value;
  const normalizedRoute = typeof route === "string" ? route.trim() : "";

  return {
    tag_schema_version: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    surface: isClickHouseQuerySurface(surface)
      ? surface
      : UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE,
    ...(normalizedRoute ? { route: normalizedRoute } : {}),
    feature: isClickHouseQueryFeature(feature)
      ? feature
      : UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE,
    ...(projectId ? { projectId } : {}),
  };
}

export function buildClickHouseLogComment(tags?: ClickHouseQueryTags): string {
  return JSON.stringify(normalizeClickHouseQueryTags(tags));
}
