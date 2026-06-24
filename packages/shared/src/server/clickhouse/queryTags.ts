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

export const CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS = {
  surface: "langfuse.clickhouse.surface",
  route: "langfuse.clickhouse.route",
  projectId: "langfuse.project.id",
} as const;

const surfaceSet = new Set<string>(clickHouseQuerySurfaces);
const featureSet = new Set<string>(clickHouseQueryFeatures);

const uuidLikePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const longHexPattern = /^[0-9a-f]{16,}$/i;
const longOpaqueIdPattern = /^[A-Za-z0-9_-]{16,}$/;

function isIdLikePathSegment(segment: string): boolean {
  return (
    /^\d+$/.test(segment) ||
    uuidLikePattern.test(segment) ||
    longHexPattern.test(segment) ||
    (longOpaqueIdPattern.test(segment) && /\d/.test(segment))
  );
}

export function sanitizeClickHouseRoute(route: string): string {
  const trimmed = route.trim();
  if (!trimmed) return trimmed;

  const [method, maybeUrl] = trimmed.match(/^[A-Z]+ /)
    ? [trimmed.split(" ")[0], trimmed.slice(trimmed.indexOf(" ") + 1)]
    : [undefined, trimmed];

  let pathname = maybeUrl.split("?")[0]?.split("#")[0] ?? maybeUrl;
  try {
    pathname = new URL(pathname).pathname;
  } catch {
    // Route is already relative or is a non-URL procedure/tool name.
  }

  const sanitized = pathname.includes("/")
    ? pathname
        .split("/")
        .map((segment) => (isIdLikePathSegment(segment) ? "{id}" : segment))
        .join("/")
    : pathname;

  return method ? `${method} ${sanitized}` : sanitized;
}

export function normalizeClickHouseQueryTags(
  tags: ClickHouseQueryTags,
): NormalizedClickHouseQueryTags {
  const baggage = propagation.getBaggage(context.active());
  const surface =
    tags.surface ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.surface)?.value;
  const route =
    tags.route ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.route)?.value;
  const projectId =
    tags.projectId ??
    baggage?.getEntry(CLICKHOUSE_QUERY_TAG_BAGGAGE_KEYS.projectId)?.value;

  if (!surface || !surfaceSet.has(surface)) {
    throw new Error(
      `Missing or invalid ClickHouse query tag surface: ${surface ?? "<missing>"}`,
    );
  }
  if (!route || !route.trim()) {
    throw new Error("Missing ClickHouse query tag route");
  }
  if (!featureSet.has(tags.feature)) {
    throw new Error(
      `Missing or invalid ClickHouse query tag feature: ${tags.feature ?? "<missing>"}`,
    );
  }

  return {
    tag_schema_version: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    surface: surface as ClickHouseQuerySurface,
    route: sanitizeClickHouseRoute(route),
    feature: tags.feature as ClickHouseQueryFeature,
    ...(projectId ? { projectId } : {}),
  };
}

export function buildClickHouseLogComment(tags: ClickHouseQueryTags): string {
  return JSON.stringify(normalizeClickHouseQueryTags(tags));
}
