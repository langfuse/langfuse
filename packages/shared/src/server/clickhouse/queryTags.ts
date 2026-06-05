import * as opentelemetry from "@opentelemetry/api";

export const CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION = "1" as const;

const CLICKHOUSE_QUERY_SOURCES = [
  "trpc",
  "public-api",
  "worker",
  "internal",
  "custom",
] as const;

export type ClickHouseQuerySource = (typeof CLICKHOUSE_QUERY_SOURCES)[number];

const CLICKHOUSE_QUERY_STORAGES = [
  "events",
  "legacy",
  "mixed",
  "unknown",
] as const;

export type ClickHouseQueryStorage = (typeof CLICKHOUSE_QUERY_STORAGES)[number];

const CLICKHOUSE_QUERY_OPERATIONS = [
  "list",
  "count",
  "lookup",
  "aggregate",
  "filter-options",
  "export",
  "batch-io",
  "write",
  "delete",
] as const;

export type ClickHouseQueryOperation =
  (typeof CLICKHOUSE_QUERY_OPERATIONS)[number];

export type ClickHouseQueryFeature = string;

export type ClickHouseQueryPhysicalTable = string;

export type NormalizedClickHouseQueryTags = {
  v: typeof CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION;
  project_id: string | "multiple" | "none" | "unknown";
  source: ClickHouseQuerySource;
  feature: ClickHouseQueryFeature;
  query: string;
  operation: ClickHouseQueryOperation;
  route?: string;
  storage: ClickHouseQueryStorage;
  table?: ClickHouseQueryPhysicalTable;
};

export type ClickHouseQueryTags = {
  source?: ClickHouseQuerySource;
  route?: string;
  feature?: ClickHouseQueryFeature;
  query?: string;
  operation?: ClickHouseQueryOperation;
  project_id?: string | "multiple" | "none" | "unknown";
  storage?: ClickHouseQueryStorage;
  table?: ClickHouseQueryPhysicalTable;
};

type NormalizeClickHouseQueryTagsArgs = {
  tags?: ClickHouseQueryTags;
  clickhouseOperation?: "select" | "command" | "insert" | "upsert";
  table?: string;
};

const BAGGAGE_KEYS = {
  source: "langfuse.clickhouse.source",
  route: "langfuse.clickhouse.route",
  projectId: "langfuse.project.id",
} as const;

function isOneOf<T extends readonly string[]>(
  values: T,
  value: string | undefined,
): value is T[number] {
  return value !== undefined && values.includes(value);
}

function getBaggageValue(key: string): string | undefined {
  return opentelemetry.propagation
    .getBaggage(opentelemetry.context.active())
    ?.getEntry(key)?.value;
}

function firstDefined(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find((value) => typeof value === "string" && value.length > 0);
}

function sanitizeTagValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeClickHouseRoute(
  route: string | undefined,
): string | undefined {
  const value = sanitizeTagValue(route)?.split("?")[0]?.split("#")[0];
  if (!value) return undefined;

  return value
    .split("/")
    .map((segment) => {
      if (!segment) return segment;
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return ":id";
      }
      if (/^[0-9a-f]{24,}$/i.test(segment)) return ":id";
      if (/^[a-z0-9_-]{24,}$/i.test(segment)) return ":id";
      if (/^\d+$/.test(segment)) return ":id";
      return segment;
    })
    .join("/");
}

function isEventsPhysicalTable(
  physicalTable: ClickHouseQueryPhysicalTable | undefined,
): boolean {
  return (
    physicalTable === "events" ||
    physicalTable === "events_core" ||
    physicalTable === "events_full"
  );
}

function inferStorage(
  tags: ClickHouseQueryTags | undefined,
  physicalTable: ClickHouseQueryPhysicalTable | undefined,
): ClickHouseQueryStorage {
  if (isOneOf(CLICKHOUSE_QUERY_STORAGES, tags?.storage)) return tags.storage;

  if (physicalTable === "multiple") return "mixed";
  if (physicalTable)
    return isEventsPhysicalTable(physicalTable) ? "events" : "legacy";

  return "unknown";
}

function inferSource(
  tags: ClickHouseQueryTags | undefined,
): ClickHouseQuerySource {
  if (isOneOf(CLICKHOUSE_QUERY_SOURCES, tags?.source)) return tags.source;

  const baggageSource = getBaggageValue(BAGGAGE_KEYS.source);
  if (isOneOf(CLICKHOUSE_QUERY_SOURCES, baggageSource)) return baggageSource;

  if (tags?.feature === "batch-export") return "worker";
  if (tags?.feature === "custom-queries") return "custom";
  if (tags?.feature === "ingestion") return "worker";
  if (tags?.feature === "data-retention") return "worker";
  if (tags?.feature === "background-migration") return "worker";

  return "internal";
}

function inferOperation(
  tags: ClickHouseQueryTags | undefined,
  clickhouseOperation: NormalizeClickHouseQueryTagsArgs["clickhouseOperation"],
): ClickHouseQueryOperation {
  if (isOneOf(CLICKHOUSE_QUERY_OPERATIONS, tags?.operation)) {
    return tags.operation;
  }

  if (clickhouseOperation === "insert" || clickhouseOperation === "upsert") {
    return "write";
  }
  if (clickhouseOperation === "command") return "write";

  return "lookup";
}

function inferProjectId(tags: ClickHouseQueryTags | undefined): string {
  return (
    sanitizeTagValue(tags?.project_id) ??
    sanitizeTagValue(getBaggageValue(BAGGAGE_KEYS.projectId)) ??
    "unknown"
  );
}

function trimRepeatedEdgeChar(value: string, char: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === char) start += 1;
  while (end > start && value[end - 1] === char) end -= 1;

  return value.slice(start, end);
}

function normalizeQueryName(value: string | undefined): string | undefined {
  const sanitized = sanitizeTagValue(value)?.split("?")[0]?.split("#")[0];
  if (!sanitized) return undefined;

  const normalized = sanitized
    .replace(/[:/]+/g, ".")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/\.+/g, ".");

  return trimRepeatedEdgeChar(trimRepeatedEdgeChar(normalized, "-"), ".");
}

function inferQueryName(
  tags: ClickHouseQueryTags | undefined,
  source: ClickHouseQuerySource,
  feature: ClickHouseQueryFeature,
  operation: ClickHouseQueryOperation,
  route: string | undefined,
  table: ClickHouseQueryPhysicalTable | undefined,
): string {
  const explicitQuery = normalizeQueryName(tags?.query);
  if (explicitQuery) return explicitQuery;

  const normalizedRoute = normalizeQueryName(route);
  const normalizedTable = normalizeQueryName(table);

  return (
    normalizeQueryName(
      [source, normalizedRoute ?? feature, normalizedTable, operation]
        .filter((part) => part && part !== "unknown")
        .join("."),
    ) ?? "unknown"
  );
}

export function normalizeClickHouseQueryTags({
  tags,
  clickhouseOperation = "select",
  table,
}: NormalizeClickHouseQueryTagsArgs): NormalizedClickHouseQueryTags {
  const route = normalizeClickHouseRoute(
    firstDefined(tags?.route, getBaggageValue(BAGGAGE_KEYS.route)),
  );
  const source = inferSource(tags);
  const feature = sanitizeTagValue(tags?.feature) ?? "unknown";
  const physicalTable = firstDefined(table, tags?.table);
  const operation = inferOperation(tags, clickhouseOperation);
  const query = inferQueryName(
    tags,
    source,
    feature,
    operation,
    route,
    physicalTable,
  );

  return {
    v: CLICKHOUSE_QUERY_TAG_SCHEMA_VERSION,
    project_id: inferProjectId(tags),
    source,
    feature,
    query,
    operation,
    ...(route ? { route } : {}),
    storage: inferStorage(tags, physicalTable),
    ...(physicalTable ? { table: physicalTable } : {}),
  };
}
