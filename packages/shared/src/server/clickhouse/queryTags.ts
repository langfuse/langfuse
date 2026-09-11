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

export type ClickHouseQueryTags = {
  surface?: ClickHouseQuerySurface | (string & {});
  route?: string;
  projectId?: string;
  sdkName?: "python" | "javascript";
  sdkVersion?: string;
  userAgent?: string;
};

export type NormalizedClickHouseQueryTags = {
  tag_schema_version: typeof CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION;
  surface: ClickHouseQuerySurface | typeof UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE;
  route?: string;
  projectId?: string;
  sdkName?: "python" | "javascript";
  sdkVersion?: string;
  userAgent?: string;
};

export const CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS = {
  surface: "langfuse.clickhouse.surface",
  route: "langfuse.clickhouse.route",
  projectId: "langfuse.project.id",
  sdkName: "langfuse.clickhouse.sdk_name",
  sdkVersion: "langfuse.clickhouse.sdk_version",
  userAgent: "langfuse.clickhouse.user_agent",
} as const;

const surfaceSet = new Set<string>(clickHouseQuerySurfaces);

const isClickHouseQuerySurface = (
  value: unknown,
): value is ClickHouseQuerySurface =>
  typeof value === "string" && surfaceSet.has(value);

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
  const projectId =
    providedTags?.projectId ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.projectId)?.value;
  const sdkName =
    providedTags?.sdkName ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.sdkName)?.value;
  const sdkVersion =
    providedTags?.sdkVersion ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.sdkVersion)?.value;
  const userAgent =
    providedTags?.userAgent ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.userAgent)?.value;
  const normalizedRoute = typeof route === "string" ? route.trim() : "";
  const normalizedSdkName =
    sdkName === "python" || sdkName === "javascript" ? sdkName : undefined;
  const normalizedSdkVersion =
    typeof sdkVersion === "string" ? sdkVersion.trim() : "";
  const normalizedUserAgent =
    typeof userAgent === "string" ? userAgent.trim() : "";
  const isPublicApi = surface === "publicapi";

  return {
    tag_schema_version: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    surface: isClickHouseQuerySurface(surface)
      ? surface
      : UNKNOWN_CLICKHOUSE_QUERY_TAG_VALUE,
    ...(normalizedRoute ? { route: normalizedRoute } : {}),
    ...(projectId ? { projectId } : {}),
    ...(isPublicApi && normalizedSdkName ? { sdkName: normalizedSdkName } : {}),
    ...(isPublicApi && normalizedSdkVersion
      ? { sdkVersion: normalizedSdkVersion }
      : {}),
    ...(isPublicApi && normalizedUserAgent
      ? { userAgent: normalizedUserAgent }
      : {}),
  };
}

export function buildClickHouseLogComment(tags?: ClickHouseQueryTags): string {
  return JSON.stringify(normalizeClickHouseQueryTags(tags));
}
